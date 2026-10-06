---
id: engine-dev-02-entry-point
index: '20'
title_zh: '【游戏引擎开发】引擎的入口点'
title_en: 'Game Engine Dev 02: Entry Point'
excerpt_zh: '应用程序启动的时候会发生什么？任何软件总会有一个程序的入口点，启动之后那些代码会开始运行，这就是程序的入口点。实现该方法的思路也很多，比如我们这里的Hazel就'
excerpt_en: 'What happens when an application starts? Every program needs an entry point — here is how Hazel does it.'
tags: ['游戏引擎', '计算机图形学', '项目', 'OpenGL']
date: '2026.03.14'
readTime: '2 min'
---

# 引擎的入口点

#### 模块调整

应用程序启动的时候会发生什么？任何软件总会有一个程序的入口点，启动之后那些代码会开始运行，这就是程序的入口点。实现该方法的思路也很多，比如我们这里的Hazel就是一个dll文件，dll文件也有主函数，我们可以附件或分离dll进程的时候调用特定代码，换句话说也就是我们的应用程序加载或卸载dll时，我们可以对这些事件进行抓取。

首先我们删除掉Test.h和Test.cpp，这些只是测试用的类。在Hazel下的src文件夹创建Hazel文件夹，我们将在这里放核心的类，创建一个Core.h和Application.h，Application.cpp

Application.h
```C++
#pragma once
namespace Hazel
{
        class Application
        {
        public:
                Application();
                ~Application();

                void Run();
        };

}
```

Application.cpp
```C++
#include "Application.h"

namespace Hazel
{
        Application::Application()
        {
        }

        Application::~Application()
        {
        }
        
        void Application::Run()
        {
                while(true);
        }
}
```

这样我们就构建了一个能够无限运行的Run()方法，此时结构如下：

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314213002.png)

tips：__declspec(dllexport)和__declspec(dllimport)可以从dll文件中导出和导入相关的内容

考虑到这是我们自己的应用程序，因此可以用宏去简化一些操作，让我们更加方便。从根本上说，我们需要找到一个宏，它要么是用作dll导入，要么就是dll导出，具体取决于我们**是否在构建这个dll文件**。

我们拆解一下需求，首先dll相关的内容都是仅限windows的内容，所以第一步是确定Hazel（下面缩写为HZ）是否是针对windows平台的。第二步是判断是否是要编译dll，是的话就export，不是就说明是import到实际项目。最后就是如果错误做一个报错处理。

Core.h
```C++
#pragma once
#ifdef HZ_PLATFORM_WINDOWS
        #ifdef HZ_BUILD_DLL
                #define HAZEL_API __declspec(dllexport)
        #else
                #define HAZEL_API __declspec(dllimport)
        #endif
#else
        #error Hazel only supports Windows!
#endif
```

随后打开Hazel和Sandbox的属性，在C/C++预处理器部分，预处理器定义（全部）分别修改添加：

HZ_PLATFORM_WINDOWS;HZ_BUILD_DLL;_WINDLL;%(PreprocessorDefinitions) HZ_PLATFORM_WINDOWS;_MBCS;%(PreprocessorDefinitions) 不知道这里会不会出问题，先这样改，本来DEBUG和Release长这样： _DEBUG;_CONSOLE;%(PreprocessorDefinitions) NDEBUG;_CONSOLE;%(PreprocessorDefinitions)

随后我们打开Hazel中的Application.h，导入Core.h后，就可以将原本的__declspec(dllexport)修改为HAZEL_API了。

Application.h
```C++
#pragma once

#include "Core.h"

namespace Hazel
{
        class HAZEL_API Application
        {
        public:
                Application();
                virtual ~Application();

                void Run();
        };
}
```

此时由于Hazel和Sandbox都有Application.cpp。所以我们将Sandbox中的Application.cpp更名为SandboxApp.cpp。

此时如果要编译，我们得使用#include<Hazel/App>这类的方式，不太方便，我们所期待的比较好的方法其实是用#include<Hazel.h>，对于该方法我们就要创建一个Hazel.h。这将是一个只给客户端应用程序包含的头文件供客户端使用，放在src文件夹内，Hazel文件夹外，这是一个供Hazel应用程序使用的头文件。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314213317.png)

在Sandbox的属性中附加包含该目录，这样我们也可以使用#include"Hazel.h"了

```C++
#include <Hazel.h>

class Sandbox : public Hazel::Application
{
public:
        Sandbox()
        {

        }

        ~Sandbox()
        {

        }
};

void main()
{
        Sandbox* sandbox = new Sandbox();
        sandbox->Run();
        delete sandbox;
}
```

此时运行程序，会出现报错：

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314213411.png)

原因是我们没有更新动态链接库dll，而他现在包含了其他内容，由于我们还没有做后续的自动化，所以手动从目录中将之前的Hazel.dll再拖入sandbox中。此时即可正常运行。

#### 入口函数EntryPoint

在Hazel文件夹下新增头文件EntryPoint.h，最开始先写成以下格式，确定一下这个头文件要做什么：

EntryPoint.h
```C++
#pragma once

#ifdef HZ_PLATFORM_WINDOWS

extern Hazel::Application* Hazel::CreateApplication();

int main(int argc, char** argv)
{
        Sandbox* sandbox = new Sandbox();
        sandbox->Run();
        delete sandbox;
}
#endif
```

以上代码将sandbox里面运行开始的地方搬过来了，意味着这是一个启动程序要做的事情，同时给了两个参数argc和argv，与Windows的WinMain有关（因为我们可能保留与程序运行方式相关的一些信息）。并且有一个返回某种数据的功能，Hazel应用程序指针，

Application.h
```C++
#pragma once

#include "Core.h"

namespace Hazel
{
    class HAZEL_API Application
    {
    public:
        Application();
        virtual ~Application();

        void Run();
    };

    //去定义在客户端中
    Application* CreateApplication();
}
```

SandboxApp.cpp
```C++
#include <Hazel.h>

class Sandbox : public Hazel::Application
{
public:
    Sandbox()
    {

    }

    ~Sandbox()
    {

    }
};

Hazel::Application* Hazel::CreateApplication()
{
    return new Sandbox();
}
```

此时我们将其添加到Application.h和SandboxApp.cpp中，就可以用这样的方式来返回这样的一个应用程序。（创建应用程序就是我们将在客户端实现的操作，Sandbox是我们要创建的应用程序）。

最后将其修改：

EntryPoint.h
```C++
#pragma once

#ifdef HZ_PLATFORM_WINDOWS

extern Hazel::Application* Hazel::CreateApplication();

int main(int argc, char** argv)
{
        auto app = Hazel::CreateApplication();
        app->Run();
        delete app;
}
#endif
```

Hazel.h
```C++
#pragma once

//For use by Hazel application

#include "Hazel/Application.h"

//------EntryPoint---------------------
#include "Hazel/EntryPoint.h"
//-------------------------------------
```

这里是为了方便模块细分，所以分开，此时我们的程序已经可以运行了。

#### 功能细分

如果我们在尝试在EntryPoint.h中添加其他的东西比如：

```C++
int main(int argc, char** argv)
{
        printf("Hazel Engine\n");
        auto app = Hazel::CreateApplication();
        app->Run();
        delete app;
}
```

此时运行就会报错，因为缺少相关的库，在Hazel.h这里添加即可。

Hazel.h
```C++
#pragma once

//For use by Hazel application

#include <stdio.h>
#include "Hazel/Application.h"

//------EntryPoint---------------------
#include "Hazel/EntryPoint.h"
//-------------------------------------
```

这只是一个测试，我们还是将这一部分的代码去掉（
