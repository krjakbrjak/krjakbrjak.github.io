---
layout: post
title:  "Building C++ projects: Know what you build, how you build it and where you build it."
date:   2022-11-21
categories:
- c++
- development tools
- cross-platform development
tags:
- cmake
- filesystem
- case-sensitivity
- c++
---

Arguably, [CMake](https://cmake.org/) is the standard tool to structure and build C++ projects. The tool is very easy and intuitive to use. But sometimes it might get tricky and some unexpected problems might pop up. And it might take a significant amount of time to understand what is going on. In this example I will show one of such problems I encountered recently. I tried to reproduce the problem with a very much simplified project (which can be found [here](https://github.com/krjakbrjak/building_cpp_projects)).

```shell
.
├── CMakeLists.txt
├── README.md
├── main.cpp
└── models
    └── Limits.h
```

The project has one main target that includes `models` directory. The code is very simple and just returns the maximum value of an integer, which is represented by the standard `INT_MAX` define. For that one needs to `#include` either `climits` or `limits.h` header file.

The following command successfully builds and generates an executable on my Linux PC:

```shell
cmake -B build -S . && cmake --build build --parallel
```

But when I tried to build this project on MacOS, then I got the following error:

```shell
main.cpp:5:19: error: use of undeclared identifier 'INT_MAX'
    static_assert(INT_MAX == std::numeric_limits<int>::max(), "What is going on?!");
                  ^
1 error generated.
```

What is going on here?

In fact, I faced this problem when I tried to build one of my projects inside an Ubuntu VM. The project is CMake-based C++ project and is being packaged by the [conan](https://conan.io/). I mounted the project directory inside the running Ubuntu VM instance (the host is MacOS) and built the project with `conan create` command. Everything was fine. But when I tried to use [local development workflow](https://docs.conan.io/en/latest/developing_packages/package_dev_flow.html) I got the following error:

```shell
main.cpp:5:19: error: ‘INT_MAX’ was not declared in this scope
    5 |     static_assert(INT_MAX == std::numeric_limits<int>::max(), "What is going on?!");
      |                   ^~~~~~~
/home/ubuntu/fs/main.cpp:3:1: note: ‘INT_MAX’ is defined in header ‘<climits>’; did you forget to ‘#include <climits>’?
    2 | #include <limits>
  +++ |+#include <climits>
    3 |
```

How come? I included `climits` just a couple of lines above. And it worked with `conan create`, and the commands that I executed manually just replicated the `create` command. Almost. I checked the build cache and saw that the folder with the successful build listed `/usr/include/c++/v1/limits.h` (inside `CMakeFiles/main.dir/main.cpp.o.d`). And failed build listed `models/limits.h`. So, it used the file from the project but the case of the filename was ignored.
Obviously, there was a difference between `conan create` and executing commands manually. Namely, `conan source`. Internally, the first thing that gets executed with `conan create` is copying the sources under `~/.conan/data/...`. So filesystems must be different for these two locations. Indeed, I used [multipass](https://multipass.run/) to spawn Ubuntu VMs, and it internally uses SSHFS to mount local filesystem inside a remote machine. But the local filesystem ([APFS](https://developer.apple.com/documentation/foundation/file_system/about_apple_file_system) in my case) is case-insensitive. And since the `models` directory was included by the target, the file `Limits.h` was found and used in place of `limits.h`. To solve the problem one has several options:

1. change the filesystem to be case-sensitive.
2. change what directories are included by the CMake targets.
3. Be careful with namings.
4. etc.

That was another important lesson showing that we have to be aware of the capabilities of the system we are working on (what kind of filesystem we are using) and the tools we are using (how to structure the project? should the target include a particular directory? what is the best name for the file? etc.).
