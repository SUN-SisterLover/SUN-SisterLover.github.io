---
id: engine-dev-04-premake
index: '22'
title_zh: '【游戏引擎开发】Premake自动项目生成'
excerpt_zh: '项目生成到底有什么意义呢？为什么不直接使用Visual Studio来做项目？'
tags: ['游戏引擎', '计算机图形学', '项目', 'OpenGL']
date: '2026.03.14'
readTime: '3 min'
---

# Premake自动项目生成

项目生成到底有什么意义呢？为什么不直接使用Visual Studio来做项目？

当我们不得不处理不同的平台的时候，就会出现弊端了。此时我们只能够处理windows上的Visual Studio文件，我们还有解决方案文件，有VcXproj文件，那些是C++项目文件，但这些都是Hazel引擎在windows上的。一旦我们涉及到linux环境，Mac环境，或者其他的就会出问题。

#### 下载Premake和基本配置

确切的说，我们需要为我们的引擎生成项目文件，这些文件可以与工具集配合使用编译这些应用程序。

https://github.com/premake/premake-core/

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314213844.png)

选择下载：premake-5.0.0-alpha13-windows.zip

首先我们在项目首页创建一个vendor文件夹，这个vendor文件夹和Hazel里面的vendor不一样，里面的vendor文件夹仅是她所需的东西，这些和我们的资料无关，而是在整个解决方案中所需要的。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314213910.png)

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314213913.png)

在vendor里面创建一个bin文件夹，再创建一个premake文件夹，并把我们刚下载的premeke5.exe扔进去：

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314213923.png)

【记得下载许可证，LICENSE.txt文件和premake.exe放在同级目录即可！】

在Premake的Github的Wiki部分有相关的介绍，如何使用Premake。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314214106.png)
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314214714.png)

在Hazel里面创建好一个premake5.lua，我们开始编写代码：

premake.lua
```Lua
workspace "Hazel"
        architecture "x64"

        configurations
        {
                "Debug",
                "Release",
                "Dist"
        }
```

写到这里，我们可以发现被设置为Hazel，然后需要配置64位操作系统，并且会有三个分别为"Debug"，"Release"，"Dist"，分别是调试，比调试更快的一个版本，完整的发行版。

#### 具体项目Hazel的配置

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314214801.png)

在Project下面，我们需要放入一些属性中的内容，比如我们的预处理器等。但是此时我们要注意到，Project "Hazel"这个实际上是我们在解决方案Hazel目录下的一个Hazel，所以我们需要确定路径，使用`location "Hazel"`。

确定文件类型，使用`kind "SharedLib"`，用于指明它是一个动态链接库文件。

指定语言类型，使用`language "C++"`，表示是C++编写的。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314215000.png)
可以在仓库中找到一个Tokens的地方，找到可以用的宏

通过代码`outputdir = "%{cfg.buildcfg}-%{cfg.system}-%{cfg.architecture}"`我们可以实现做一个类似-Debug-Windows-X64的东西。

同时确定我们要输出的目录，也就是targetdir，还有中间目录objdir

files文件则是

includedirs取决于附加包含目录

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314215114.png)

filter是**条件过滤**，这里是让其只对windows有效。

cppdialect则是选择对应的C++版本，避免默认编译器使用C++14的标准。

staticruntime "On"（暂时不明，学习的知识不够我了解）

systemversion需要定义为Windows SDK版本，如果不输入的话就会默认是8.1的版本，本机需要有这个版本才可以，不然会找不到。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314215124.png)

defines则会开始使用我们预处理器，这里不清楚是否使用了_WINDLL，所以先不用。

下面再写一个postbuildcommands，用来做“每次我们启动的时候将Hazel.dll复制进Sandbox文件夹”的操作。

下面这一个filter则是我们要做的调试的条件过滤，注意这里并不是windows+Debug，这里只是单纯的Debug而已，如果两项操作要一起进行那么必须指定两种过滤选项。

premake.lua
```Lua
workspace "Hazel"
        architecture "x64"

        configurations
        {
                "Debug",
                "Release",
                "Dist"
        }

outputdir = "%{cfg.buildcfg}-%{cfg.system}-%{cfg.architecture}"

project "Hazel"
        location "Hazel"
        kind "SharedLib"
        language "C++"

        targetdir ("bin/".. outputdir .. "/%prj.name")
        objdir ("bin-int/".. outputdir .. "/%prj.name")

        files
        {
                "%{prj.name}/src/**.h",
                "%{prj.name}/src/**.cpp"
        }

        includedirs
        {
                "%{prj.name}/vendor/spdlog/include"
        }

        filter "system:windows"
                cppdialect "c++17"
                staticruntime "On"
                systemversion "10.0.22621.0"

                defines
                {
                        "HZ_PLATFORM_WINDOWS",
                        "HZ_BUILD_DLL"
                }

                postbuildcommands
                {
                        ("{COPY} %{cfg.buildtarget.relpath} ../bin/" .. outputdir .. "/Sandbox")
                }

        filter "configurations:Debug"
                defines "HZ_DEBUG"
                symbols "On"

        filter "configurations:Release"
                defines "HZ_RELEASE"
                symbols "On"

        filter "configurations:Dist"
                defines "HZ_DIST"
                symbols "On"
```

这就是Hazel项目的配置，可以用相同的方式去配置Sandbox

#### Sandbox的配置和最终测试

依旧是继续写下来，需要注意的是location有所更改，includedirs多了一个Hazel/src，并且预处理器少了一个。由于Sandbox需要连接Hazel，所以需要写有关于链接的命令。  

```SQL
project "Sandbox"
        location "Sandbox"
        kind "ConsoleApp"
        language "C++"

        targetdir ("bin/".. outputdir .. "/%prj.name")
        objdir ("bin-int/".. outputdir .. "/%prj.name")

        files
        {
                "%{prj.name}/src/**.h",
                "%{prj.name}/src/**.cpp"
        }

        includedirs
        {
                "%{prj.name}/vendor/spdlog/include",
                "Hazel/src"
        }
        
        links
        {
            "Hazel"
        }

        filter "system:windows"
                cppdialect "c++17"
                staticruntime "On"
                systemversion "10.0.22621.0"

                defines
                {
                        "HZ_PLATFORM_WINDOWS"
                }

        filter "configurations:Debug"
                defines "HZ_DEBUG"
                symbols "On"

        filter "configurations:Release"
                defines "HZ_RELEASE"
                symbols "On"

        filter "configurations:Dist"
                defines "HZ_DIST"
                symbols "On"
```

接下来我们可以删除掉主页的bin和bin-int文件，将Hazel和Sandbox里面除了src和vendor文件夹之外的都删掉，包括Hazel.sln也删掉。

在Hazel工程中船创建一个GenerateProjects.bat批处理文件，内容为：

```Lua
call vendor\bin\premake\premake5.exe vs2017
PAUSE
```

此时，直接执行该批处理文件！

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314215327.png)

会帮我们重新创建好工程！

#### 构建的时候遇见的BUG和解决方案

问题一：因为我直接运行的时候使用的VisualStdio跑的，默认是运行的Hazel这个dll文件。

出现此问题是因为直接运行了dll，这是一个动态运行库，方案一是直接构建，然后打开文件夹去运行Sandbox.exe。方案二应该就是修改设为启动项目就好了。

问题二：经典的utf-8报SPDLOG的错，之前已经解决过一次了不说了。

问题三：超级难绷的构建问题，因为本文是跟着教程走的，貌似可能是因为Premake选择的版本比较低，无法构建vs2022版本的，所以是构建2017然后升级为2022，会报错工具v141的bug，这个时候打开属性，点击平台工具集就行

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314215344.png)

问题四：找不到SPDLOG的头文件

我很奇怪，但是估计是可能视频里面看错了，我把Premake.lua里面改了一下就行，就是改Sandbox的内容（后面果然作者也改了）

```Lua
includedirs
    {
        "Hazel/vendor/spdlog/include",
        "Hazel/src"
    }
```

神秘BUG：
构建的时候是以VS2017来构建的，我目前的电脑是VS2022，进入sln项目后，然后我要先把VS2017的平台工具集v141改成v143，然后因为用到一个日志文件库spdlog，要手动加一个/utf-8。然后这俩一起加上去就直接卡死主线程，无法编译bin。
我现在不输入/utf-8，编译一半就会帮我把这个卡死的主线程因为检测到utf-8报错，直接帮我把主线程退出来，然后我再输入/utf-8，就能成功编译了。
