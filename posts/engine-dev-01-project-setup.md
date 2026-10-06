---
id: engine-dev-01-project-setup
index: '19'
title_zh: '【游戏引擎开发】项目设置'
title_en: 'Game Engine Dev 01: Project Setup'
excerpt_zh: '你好本笔记是根据Youtobe大佬的游戏引擎开发课程所编写的，欢迎阅读本文章，我是来自长春理工大学游隙拾光工作室的神秘柚子学长（子浔），本篇开启于2025.9，'
excerpt_en: "Notes following TheCherno's game engine series — setting up the project."
tags: ['游戏引擎', '计算机图形学', '项目', 'OpenGL']
date: '2026.03.14'
readTime: '4 min'
---

你好~本笔记是根据Youtobe大佬的游戏引擎开发课程所编写的，欢迎阅读本文章，我是来自**长春理工大学游隙拾光工作室**的神秘柚子学长（子浔），本篇开启于2025.9，在阅读前请确保自己有一定的使用引擎的经验，并且对C++，C#，OpenGL有一定熟悉，对软件架构和计算机图形学有一定的基础，最好对Visual Studio，工程构建有一定涉及。

做了一场和游戏有关的梦~

【难度：⭐⭐⭐⭐⭐】【推荐度：⭐⭐⭐⭐】

Q：什么是游戏引擎

A：游戏引擎就是一种可以读取数据并将其转换为我们可以在屏幕上看到东西的方式，这就是游戏引擎的本质所在。我们构建的游戏引擎就是一种可以读取文件、转换文件然后在屏幕上显示的东西，并且还添加了交互功能。

Q：游戏引擎通常由那些系统组成？

A：平台抽象层：考虑到我们可能在Linux或移动平台如Android和ios，又或者游戏主机平台如Xbox等运行，所以我们需要平台抽象层从而使我们的游戏在多个平台上运行，将特定平台的细节从我们身边剔除，让我们能够编写代码。

# Game Engine 游戏引擎设计

Entry Point 入口：使用该引擎制作的游戏/程序启动之后，会发生什么。

Application Layer 应用层：负责应用的生命周期和事件处理，需要一个方法来实际运行的我们的引擎作为一个真正的应用。

Window Layer 窗口层：在这里执行窗口显示有关的内容。并且给需要处理输入以及事件等内容，我们的事件管理器会处理这些。

Rendener 渲染层：

(这里先不动，还是先进入代码层，以后再来回顾这些）

**【知识】动态链接库：** https://www.cnblogs.com/liulianzhen99/articles/17920660.html

游戏只需要依赖一个单一的dll文件，它会提供所有的需要的内容，而不是链接成千上万的其他库文件。所以我们需要将所有内容链接到引擎dll中，包括所有依赖项，意味着它们都需要是静态库。我们将这些静态库连接到引擎dll上，随后再将引擎dll链接到游戏上。

# 项目设置

#### 基础配置

右键Hazel解决方案（这是一个新建的C++空项目），在**配置管理器**中将平台设置为x64（将win32x86删除），并且将**配置类型**修改为动态库dll的方式。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314212215.png)

随后，Visual Studio的默认输出目录和临时目录并不好，我们将其修改为以下内容：

```Plain
$(SolutionDir)bin\$(Configuration)-$(Platform)\$(ProjectName)\
$(SolutionDir)bin-int\$(Configuration)-$(Platform)\$(ProjectName)\
```

在解决方案目录中创建一个名为bin的文件夹，我们会将所有的内容，所有的绑定，所有的库，以及解决方案中所有的项目所有内容都放在bin目录中，同时根据实际的配置来分开这些项目。考虑到bin文件夹存放着我们所有的实际内容，所以将中间目录设置为bin-int，这样更方便。

#### 创建游戏

在解决方案管理器中我们新建一个C++空项目，命名为Sandbox，此时打开Sandbox的属性，会发现它创建了自己的属性，我们需要打开属性按照上一步的方法将win32x86的配置删除，同时配置输出目录和中间目录。对于**配置类型**，我们使用exe即可。同时右键，我们将Sandbox设置为启动项目。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314212319.png)

随后我们**关闭解决方案**，对根目录下的Hazel.sln文件使用文本编辑器打开（这里使用的是VsCode），打开之后的可能如下（这里以我的电脑举例子）：

```SQL
Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.10.35013.160
MinimumVisualStudioVersion = 10.0.40219.1
Project("{8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942}") = "Hazel", "Hazel\Hazel.vcxproj", "{CAE70A6D-06F8-4325-AF16-B336751D5E28}"
EndProject
Project("{8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942}") = "Sandbox", "Sendbox\Sendbox.vcxproj", "{64BEA0D1-8987-46FD-B26D-ED8115818BFE}"
EndProject
Global
        GlobalSection(SolutionConfigurationPlatforms) = preSolution
                Debug|x64 = Debug|x64
                Release|x64 = Release|x64
        EndGlobalSection
        GlobalSection(ProjectConfigurationPlatforms) = postSolution
                {CAE70A6D-06F8-4325-AF16-B336751D5E28}.Debug|x64.ActiveCfg = Debug|x64
                {CAE70A6D-06F8-4325-AF16-B336751D5E28}.Debug|x64.Build.0 = Debug|x64
                {CAE70A6D-06F8-4325-AF16-B336751D5E28}.Release|x64.ActiveCfg = Release|x64
                {CAE70A6D-06F8-4325-AF16-B336751D5E28}.Release|x64.Build.0 = Release|x64
                {64BEA0D1-8987-46FD-B26D-ED8115818BFE}.Debug|x64.ActiveCfg = Debug|x64
                {64BEA0D1-8987-46FD-B26D-ED8115818BFE}.Debug|x64.Build.0 = Debug|x64
                {64BEA0D1-8987-46FD-B26D-ED8115818BFE}.Release|x64.ActiveCfg = Release|x64
                {64BEA0D1-8987-46FD-B26D-ED8115818BFE}.Release|x64.Build.0 = Release|x64
        EndGlobalSection
        GlobalSection(SolutionProperties) = preSolution
                HideSolutionNode = FALSE
        EndGlobalSection
        GlobalSection(ExtensibilityGlobals) = postSolution
                SolutionGuid = {FC95A518-1A00-4DD0-A29A-F7C3CBF63FED}
        EndGlobalSection
EndGlobal
```

注意到第五行第七行的位置，我们将其进行一个顺序替换，这样对于GitHub上下载本项目的人来说，Sa

ndbox就会自动变成启动项目，而不是Hazel引擎。如果Hazel是启动项目，显然无法运行，它只是一个dll动态链接库。

启动项目，右键Sandbox，添加引用Hazel，进行链接。这意味着当Hazel实际编译并且生成静态库文件和dll文件时，Hazel将被链接于Sandbox

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314212335.png)

Q：为什么这里.lib没有出现"E:\GameEngine\Hazel\bin\Debug-x64\Hazel\Hazel.lib"？
A：暂未解决，按道理这里连接之后应该会多一个调用Hazel.lib。不知道为什么，但是能正常运行，应该是已经连接上了，但是无法运行的原因不知道，不查明了暂时。

Q：为什么这里是lib文件而不是dll文件？
A：在Visual Studio中编译这个dll文件时，实际上会产生两个文件，lib文件包含了我们从dll文件中导出的每一个函数的详细信息，这样我们就无需手动从dll文件中加载函数或符号了，同时它还会生成这个DL文件里面包含实际的机器代码以及其他连接相关的内容，所以我们实际可以静态链接Hazel.lib这个DL文件

#### 测试

在Hazel中创建src文件夹（Sendbox也创建src文件夹）负责存储源码，创建Text.h和Text.cpp编写以下代码：

Text.h
```C++
#pragma once

namespace Hazel {
        _declspec(dllexport) void Print();
}
```

Text.cpp
```C++
#include "Test.h"
#include <stdio.h>

namespace Hazel {
        void Print()
        {
                printf("Welcome to Hazel Engine!\n");
        }
}
```

随后右键Hazel，点击Build（生成/构建），注意到此时本地文件夹资源变为了以下结构：

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314212514.png)

  在Sandbox里面创建一个Application.cpp，创建完后输入代码，随后也进行Build。

Application.cpp
```C++
namespace Hazel {
        _declspec(dllimport) void Print();
}

void main()
{
        Hazel::Print();
}
```

A：在对应目录下找不到名为Hazel.ilk和Sendbox.ild的文件，初步诊断应该是链接上出了问题，后续再继续研究。
Q：目前发现lik居然在bin-int文件夹中……奇怪。
已解决，将连接器中**增量连接数据库**文件的地址中的IntDir改成OutDir即可。

此时如果进行编码会出现错误，因为缺少那个DL文件而报错。考虑到此时我们只是测试，所以可以手动将Hazel.dll先暂时放在Sendbox的文件夹中，运行一次尝试。（后续我们会将其修改为自动化的方式，此时只是为了让学习的过程更加顺利）

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314212631.png)
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314212637.png)

运行成功了喵~
