// If your file name follows the structure name_{GOOS}_{GOARCH}.go or
// simply name_{GOOS}.go,
// then it will be compiled only under the target OS+architecture
// or OS+any architecture respectively without needing a special comment
package platform

//#cgo CFLAGS: -g -Wall
//#cgo LDFLAGS: -lws2_32
//#include "errno.h"
//#include "../socketpair_handler.h"
import "C"

import (
	"fmt"
	"syscall"
	"unsafe"
)

func GetSocketPair() ([]syscall.Handle, *C.SOCKET, error) {
	fds := make([]syscall.Handle, 2)
	fds_pt := C.get_socket_pair()
	fds_array := (*[2]C.SOCKET)(unsafe.Pointer(fds_pt))[:]
	fds[0] = syscall.Handle(uintptr(fds_array[0]))
	fds[1] = syscall.Handle(uintptr(fds_array[1]))
	return fds, fds_pt, nil
}

func CloseSocket(fd syscall.Handle) error {
	fmt.Println("Closing socket", fd)
	err := syscall.Close(fd)
	if err != nil {
		errCode := syscall.GetLastError()
		// Handle the error or print it for debugging
		fmt.Printf("Error closing handle: %v\n", err)
		fmt.Printf("Errorcode: %v\n", errCode)
		return err
	}
	fmt.Println("Closed socket", fd)
	return nil
}

func ReadSocket(fd syscall.Handle, buf *[256]byte) {
	fmt.Println("Reading socket", fd)
	syscall.Read(fd, (*buf)[:])
}

func SendMessage(fd syscall.Handle, p []byte, connFd int, to syscall.Sockaddr, flags int) error {
	fmt.Println("Writing socket", fd)
	var written uint32
	err := syscall.WSAStartup(uint32(0x202), &syscall.WSAData{})
	if err != nil {
		return err
	}
	defer syscall.WSACleanup()

	// Prepare message to send both data and file descriptor
	// We send the connection FD as an integer following the data
	buf := make([]byte, len(p)+4)
	copy(buf, p)
	// Convert connFd to network byte order (big endian) for portability
	buf[len(p)] = byte(connFd >> 24)
	buf[len(p)+1] = byte(connFd >> 16)
	buf[len(p)+2] = byte(connFd >> 8)
	buf[len(p)+3] = byte(connFd)

	iov := syscall.WSABuf{
		Len: uint32(len(buf)),
		Buf: &buf[0],
	}
	var flagsUint32 uint32 = uint32(flags)
	err = syscall.WSASend(fd, &iov, 1, &written, flagsUint32, nil, nil)
	if err != nil {
		return err
	}

	fmt.Printf("Sent message with FD: %d\n", connFd)
	return nil
}

func Shutdown(fd syscall.Handle, how int) error {
	return syscall.Shutdown(fd, how)
}
