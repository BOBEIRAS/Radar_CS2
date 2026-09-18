#include <ntifs.h>
#include <ntddk.h>
#include "driver_shared.hpp"

// Undocumented NT kernel routines & structs
extern "C" {
    NTKERNELAPI NTSTATUS NTAPI MmCopyVirtualMemory(
        PEPROCESS SourceProcess,
        PVOID SourceAddress,
        PEPROCESS TargetProcess,
        PVOID TargetAddress,
        SIZE_T BufferSize,
        KPROCESSOR_MODE PreviousMode,
        PSIZE_T ReturnSize
    );

    NTKERNELAPI PPEB NTAPI PsGetProcessPeb(PEPROCESS Process);
}

typedef struct _LDR_DATA_TABLE_ENTRY_KERNEL {
    LIST_ENTRY InLoadOrderLinks;
    LIST_ENTRY InMemoryOrderLinks;
    LIST_ENTRY InInitializationOrderLinks;
    PVOID DllBase;
    PVOID EntryPoint;
    ULONG SizeOfImage;
    UNICODE_STRING FullDllName;
    UNICODE_STRING BaseDllName;
} LDR_DATA_TABLE_ENTRY_KERNEL, *PLDR_DATA_TABLE_ENTRY_KERNEL;

typedef struct _PEB_LDR_DATA_KERNEL {
    ULONG Length;
    UCHAR Initialized;
    PVOID SsHandle;
    LIST_ENTRY InLoadOrderModuleList;
    LIST_ENTRY InMemoryOrderModuleList;
    LIST_ENTRY InInitializationOrderModuleList;
} PEB_LDR_DATA_KERNEL, *PPEB_LDR_DATA_KERNEL;

// Module base helper using APC attach to process address space
static NTSTATUS GetProcessModuleBase(ULONG process_id, const wchar_t* module_name, unsigned __int64* out_base, unsigned __int64* out_size)
{
    if (!process_id || !module_name || !out_base || !out_size)
        return STATUS_INVALID_PARAMETER;

    *out_base = 0;
    *out_size = 0;

    PEPROCESS process = NULL;
    NTSTATUS status = PsLookupProcessByProcessId((HANDLE)(ULONG_PTR)process_id, &process);
    if (!NT_SUCCESS(status) || !process)
        return STATUS_NOT_FOUND;

    KAPC_STATE apc_state;
    KeStackAttachProcess(process, &apc_state);

    __try {
        PPEB peb = PsGetProcessPeb(process);
        if (peb) {
            PPEB_LDR_DATA_KERNEL ldr = *(PPEB_LDR_DATA_KERNEL*)((PUCHAR)peb + 0x18);
            if (ldr) {
                PLIST_ENTRY list_head = &ldr->InLoadOrderModuleList;
                for (PLIST_ENTRY curr = list_head->Flink; curr && curr != list_head; curr = curr->Flink) {
                    PLDR_DATA_TABLE_ENTRY_KERNEL entry = CONTAINING_RECORD(curr, LDR_DATA_TABLE_ENTRY_KERNEL, InLoadOrderLinks);
                    if (entry && entry->BaseDllName.Buffer && entry->BaseDllName.Length > 0) {
                        UNICODE_STRING target_name;
                        RtlInitUnicodeString(&target_name, module_name);

                        if (RtlCompareUnicodeString(&entry->BaseDllName, &target_name, TRUE) == 0) {
                            *out_base = (unsigned __int64)(ULONG_PTR)entry->DllBase;
                            *out_size = (unsigned __int64)entry->SizeOfImage;
                            status = STATUS_SUCCESS;
                            break;
                        }
                    }
                }
            }
        }
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        status = GetExceptionCode();
    }

    KeUnstackDetachProcess(&apc_state);
    ObDereferenceObject(process);
    return status;
}

// Memory read handler
static NTSTATUS ReadVirtualMemory(ULONG process_id, unsigned __int64 address, PVOID user_buffer, SIZE_T size, PSIZE_T bytes_read)
{
    if (!process_id || !address || !user_buffer || !size || !bytes_read)
        return STATUS_INVALID_PARAMETER;

    *bytes_read = 0;

    PEPROCESS process = NULL;
    NTSTATUS status = PsLookupProcessByProcessId((HANDLE)(ULONG_PTR)process_id, &process);
    if (!NT_SUCCESS(status) || !process)
        return STATUS_NOT_FOUND;

    SIZE_T copied = 0;
    status = MmCopyVirtualMemory(
        process,
        (PVOID)address,
        PsGetCurrentProcess(),
        user_buffer,
        size,
        KernelMode,
        &copied
    );

    ObDereferenceObject(process);

    if (NT_SUCCESS(status)) {
        *bytes_read = copied;
    }

    return status;
}

// IOCTL dispatcher
NTSTATUS RadarIoControl(PDEVICE_OBJECT DeviceObject, PIRP Irp)
{
    UNREFERENCED_PARAMETER(DeviceObject);

    PIO_STACK_LOCATION stack = IoGetCurrentIrpStackLocation(Irp);
    ULONG control_code = stack->Parameters.DeviceIoControl.IoControlCode;
    ULONG in_buffer_length = stack->Parameters.DeviceIoControl.InputBufferLength;
    ULONG out_buffer_length = stack->Parameters.DeviceIoControl.OutputBufferLength;
    PVOID buffer = Irp->AssociatedIrp.SystemBuffer;

    NTSTATUS status = STATUS_INVALID_DEVICE_REQUEST;
    ULONG_PTR bytes_ret = 0;

    switch (control_code)
    {
    case IOCTL_RADAR_PING:
    {
        if (in_buffer_length >= sizeof(radar_ping_packet_t) && out_buffer_length >= sizeof(radar_ping_packet_t))
        {
            radar_ping_packet_t* packet = (radar_ping_packet_t*)buffer;
            if (packet->magic == RADAR_MAGIC)
            {
                packet->status = RADAR_MAGIC;
                bytes_ret = sizeof(radar_ping_packet_t);
                status = STATUS_SUCCESS;
            }
            else
            {
                status = STATUS_INVALID_PARAMETER;
            }
        }
        else
        {
            status = STATUS_BUFFER_TOO_SMALL;
        }
        break;
    }

    case IOCTL_RADAR_READ_MEMORY:
    {
        if (in_buffer_length >= sizeof(radar_read_packet_t) && out_buffer_length >= sizeof(radar_read_packet_t))
        {
            radar_read_packet_t* packet = (radar_read_packet_t*)buffer;
            SIZE_T read_count = 0;

            status = ReadVirtualMemory(
                packet->process_id,
                packet->address,
                (PVOID)packet->buffer,
                (SIZE_T)packet->size,
                &read_count
            );

            if (NT_SUCCESS(status))
            {
                bytes_ret = sizeof(radar_read_packet_t);
            }
        }
        else
        {
            status = STATUS_BUFFER_TOO_SMALL;
        }
        break;
    }

    case IOCTL_RADAR_GET_BASE:
    {
        if (in_buffer_length >= sizeof(radar_base_packet_t) && out_buffer_length >= sizeof(radar_base_packet_t))
        {
            radar_base_packet_t* packet = (radar_base_packet_t*)buffer;
            unsigned __int64 base = 0;
            unsigned __int64 size = 0;

            status = GetProcessModuleBase(packet->process_id, packet->module_name, &base, &size);
            if (NT_SUCCESS(status))
            {
                packet->base_address = base;
                packet->module_size = size;
                bytes_ret = sizeof(radar_base_packet_t);
            }
        }
        else
        {
            status = STATUS_BUFFER_TOO_SMALL;
        }
        break;
    }

    default:
        status = STATUS_INVALID_DEVICE_REQUEST;
        break;
    }

    Irp->IoStatus.Status = status;
    Irp->IoStatus.Information = bytes_ret;
    IoCompleteRequest(Irp, IO_NO_INCREMENT);
    return status;
}

NTSTATUS RadarCreateClose(PDEVICE_OBJECT DeviceObject, PIRP Irp)
{
    UNREFERENCED_PARAMETER(DeviceObject);
    Irp->IoStatus.Status = STATUS_SUCCESS;
    Irp->IoStatus.Information = 0;
    IoCompleteRequest(Irp, IO_NO_INCREMENT);
    return STATUS_SUCCESS;
}

VOID RadarUnload(PDRIVER_OBJECT DriverObject)
{
    UNICODE_STRING symlink_name;
    RtlInitUnicodeString(&symlink_name, DRIVER_DOS_DEVICE_NAME);
    IoDeleteSymbolicLink(&symlink_name);

    if (DriverObject->DeviceObject)
    {
        IoDeleteDevice(DriverObject->DeviceObject);
    }
}

extern "C" NTSTATUS DriverEntry(PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath)
{
    UNREFERENCED_PARAMETER(RegistryPath);

    UNICODE_STRING device_name;
    UNICODE_STRING symlink_name;
    RtlInitUnicodeString(&device_name, DRIVER_DEVICE_NAME);
    RtlInitUnicodeString(&symlink_name, DRIVER_DOS_DEVICE_NAME);

    PDEVICE_OBJECT device_object = NULL;
    NTSTATUS status = IoCreateDevice(
        DriverObject,
        0,
        &device_name,
        FILE_DEVICE_UNKNOWN,
        FILE_DEVICE_SECURE_OPEN,
        FALSE,
        &device_object
    );

    if (!NT_SUCCESS(status))
        return status;

    status = IoCreateSymbolicLink(&symlink_name, &device_name);
    if (!NT_SUCCESS(status))
    {
        IoDeleteDevice(device_object);
        return status;
    }

    DriverObject->MajorFunction[IRP_MJ_CREATE]         = RadarCreateClose;
    DriverObject->MajorFunction[IRP_MJ_CLOSE]          = RadarCreateClose;
    DriverObject->MajorFunction[IRP_MJ_DEVICE_CONTROL]  = RadarIoControl;
    DriverObject->DriverUnload                         = RadarUnload;

    device_object->Flags |= DO_BUFFERED_IO;
    device_object->Flags &= ~DO_DEVICE_INITIALIZING;

    return STATUS_SUCCESS;
}
