---
layout: post
title:  "Simulating GPIO Sysfs Interface with FUSE and C++"
date:   2024-01-13
categories: embedded linux c++ simulation
tags:
- linux
- gpio
- fuse
- sysfs
- embedded
- c++
- testing
- cmake
---

Interacting with General-Purpose Input/Output (GPIO) pins is a core part of embedded development. The [GPIO sysfs interface](https://www.kernel.org/doc/Documentation/gpio/sysfs.txt) is a standard way to access and manipulate these pins on Linux. But what if you don’t have access to the hardware? Simulating the GPIO sysfs interface with [FUSE (Filesystem in Userspace)](https://www.kernel.org/doc/html/next/filesystems/fuse.html) and C++ provides a powerful solution.

**Why Simulate GPIO Sysfs?**
- Accelerate development: Test and develop without physical hardware.
- Enhance testing: Create robust test scenarios for embedded software.
- Experiment and learn: Safely explore GPIO features in a virtual environment.

## Project Motivation

The [gpio-sysfs-simulator](https://github.com/krjakbrjak/gpio-sysfs-simulator) project was born from the need to work with GPIO sysfs when hardware wasn’t available. While tools like [LD_PRELOAD](https://man7.org/linux/man-pages/man8/ld.so.8.html) can intercept syscalls, they add complexity. FUSE lets you build a custom filesystem in user space, making it ideal for emulating sysfs.

**Benefits of FUSE:**
- User-friendly: Mirrors real GPIO sysfs structure.
- Seamless: Read/write virtual pins as if they were real.
- Efficient: Uses kernel features for async monitoring.
- Clean code: FUSE handles state, so you focus on logic.

## Key Filesystem Hooks

The simulator uses [libfuse](https://github.com/libfuse/libfuse) to implement essential hooks:

- `getattr`: Returns file/directory info.
- `readdir`: Lists directory contents.
- `read`: Gets GPIO pin state.
- `write`: Sets GPIO pin state.
- `poll`: Notifies kernel of pin state changes (for async tools like epoll).

**Example:**
```cpp
// Example: read hook
int do_read(const char* path, char* buf, size_t size, off_t offset, struct fuse_file_info* fi) {
	// ...simulate reading pin state...
}
```

## Automatic Pin Management

Pins are managed automatically when writing to `/export` or `/unexport`, just like the kernel. Advanced features include:

- Error simulation: Test restricted access and error handling.
- Performance monitoring: Track operation times and resource usage.


## Why FUSE Over LD_PRELOAD?

While `LD_PRELOAD` can intercept syscalls, it’s hard to manage state across reads. FUSE provides a full userspace filesystem, making the solution cleaner and easier to maintain.

## Getting Started

**Build and run the simulator:**
```sh
git clone https://github.com/krjakbrjak/gpio-sysfs-simulator.git
cd gpio-sysfs-simulator
cmake -B build -S . -DCMAKE_INSTALL_PREFIX=$(pwd)/build/INSTALLDIR
cmake --build build --parallel
export LD_LIBRARY_PATH=$(pwd)/build/INSTALLDIR/lib/x86_64-linux-gnu
$(pwd)/build/INSTALLDIR/bin/gpio-sysfs-simulator /tmp/gpio-sim
```
Now you can interact with `/tmp/gpio-sim` just like `/sys/class/gpio`.

> **Note**: the command must be run with elevated rights. See [this](https://github.com/libfuse/libfuse?tab=readme-ov-file#security-implications) for more details.

## Conclusion

Simulating GPIO sysfs with FUSE and C++ is a flexible, developer-friendly way to test and experiment with embedded code—no hardware required. Check out the [project on GitHub](https://github.com/krjakbrjak/gpio-sysfs-simulator), and feel free to contribute or share your feedback. Happy coding!
