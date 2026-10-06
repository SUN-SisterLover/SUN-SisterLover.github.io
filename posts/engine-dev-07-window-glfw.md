---
id: engine-dev-07-window-glfw
index: '25'
title_zh: '【游戏引擎开发】窗口抽象与GLFW'
title_en: 'Game Engine Dev 07: Window Abstraction & GLFW'
excerpt_zh: '我们将会使用一个修改过的GLFW的库：https://github.com/TheCherno/glfw'
excerpt_en: 'Using a modified GLFW library for window creation.'
tags: ['游戏引擎', '计算机图形学', '项目', 'OpenGL']
date: '2026.03.14'
readTime: '3 min'
---

# 窗口抽象与GLFW

#### 前期的修改

我们将会使用一个修改过的GLFW的库：https://github.com/TheCherno/glfw

在cmd中直接：`git submodule add` `https://github.com/TheCherno/glfw` `Hazel/vendor/GLFW`

下载好该仓库。

随后我们编辑Hazel文件夹下的premake5.lua

```Lua
......
outputdir = "%{cfg.buildcfg}-%{cfg.system}-%{cfg.architecture}"

//从这里开始修改
-- Include directories relative to root folder (solution directory)
IncludeDir = {}
IncludeDir["GLFW"] = "Hazel/vendor/GLFW/include"

include "Hazle/vendor/GLFW"

......
includedirs
{
    "%{prj.name}/src",
    "%{prj.name}/vendor/spdlog/include",
    "%{IncludeDir.GLFW}"
}

links
{
    "GLFW",
    "opengl32.lib"
}
```

一个是负责添加GLFW的目录。另外下面这个include则是因为该目录下也有一个premake5.lua，这样就能两个一起都被使用了。

并且在includedirs加上这个目录，然后Hazel需要连接到GLFW中。

此时我们回到桌面，重新构建该项目（用bat）。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314221456.png)

我们使用的premake版本太旧了，要换个新的。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314221505.png)

换了个新版本果然好了（尝试将版本构建直接改成vs2022试试看？）

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314221518.png)

此时回到Hazel，会发现这里已经引用了GLFW。尝试Build一下GLFW，应该不会有报错。

#### 构建窗口类等

先给Core.h加上这样一段代码：

Core.h
```C++
......
#ifdef HZ_ENABLE_ASSERTS
        #define HZ_ASSERTS(x, ...) { if(!(x)) { HZ_ERROR("Assertion Failed: {0}", __VA_ARGS__); __debugbreak(); } }
        #define HZ_CORE_ASSERT(x, ...) {if(!(x)) { HZ_CORE_ERROR("Assertion Failed: {0}", __VA_ARGS); __debugbreak(; )}}
#else
        #define HZ_ASSERT(x, ...)
        #define HZ_CORE_ASSERT(x, ...)
#endif
```

这段代码的用处是写了一个条件编译的断言宏定义，用于在调试Debug模式下捕获程序中的逻辑错误，而在发布Release模式则完全移除断言检查，避免性能开销。

WindowsWindow.h
```C++
#pragma once

#include "hzpch.h"

#include "Hazel/Core.h"
#include "Hazel/Events/Event.h"

namespace Hazel {

        struct WindowProps
        {
                std::string Title;
                unsigned int Width;
                unsigned int Height;

                WindowProps(const std::string& title = "Hazel Engine",
                        unsigned int width = 1280,
                        unsigned int height = 720)
                        : Title(title), Width(width), Height(height)
                {
                }
        };

        class HAZEL_API Window
        {
        public:
                using EventCallbackFn = std::function<void(Event&)>;

                virtual ~Window() {}

                virtual void OnUpdate() = 0;

                virtual unsigned int GetWidth() const = 0;
                virtual unsigned int GetHeight() const = 0;

                virtual void SetEventCallback(const EventCallbackFn& callback) = 0;
                virtual void SetVSync(bool enabled) = 0;
                virtual bool IsVSync() const = 0;

                static Window* Create(const WindowProps& props = WindowProps());
        };
}
```

这是一个为窗口准备的Windows.h，这段代码是Hazel引擎的窗口抽象基类。

结构体WindowProps中构造窗口用的参数包，标题，宽高。

Windows则是Hazel引擎的窗口抽象接口，定义了一套平台窗口必须实现的通用行为，本身并不能被实例化。

`EventCallbackFn`定义了事件回调函数的类型，当发生窗口事件的时候会用这个函数通知上层。//这里不是Event吗？如何确定是窗口事件呢？

纯虚函数用于确保基类指针删除派生类对象时不会内存泄漏。

`OnUpdate()`每帧调用一次，负责处理窗口消息，刷新缓冲区，由主循环反复调用。

`GetWidth()`和`GetHeight()`用于获取窗口的宽高，且不会修改窗口对象的状态。

`SetEventCallback()`设置事件回调函数，窗口收到事件会通过这个函数把事件传给上层。

`SetVSync()`和`IsVSync()`设置是否开启垂直同步

`Window* Create()`静态工厂函数，用于创建窗口实例。

![262](images/ComputerScience/计算机图形学/Pasted%20image%2020260314221535.png)

WindowsWindow.h
```C++
#pragma once

#include "Hazel/Window.h"
#include "Hazel/Log.h"

#include <GLFW/glfw3.h>

namespace Hazel{
        class WindowsWindow : public Window
        {
        public:
                WindowsWindow(const WindowProps& props);
                virtual ~WindowsWindow();

                void OnUpdate() override;

                inline unsigned int GetWidth() const override { return m_Data.Width; }
                inline unsigned int GetHeight() const override { return m_Data.Height; }

                inline void SetEventCallback(const EventCallbackFn& callback) override { m_Data.EventCallback = callback; }
                void SetVSync(bool enabled) override;
                bool IsVSync() const override;
        private:
                virtual void Init(const WindowProps& props);
                virtual void Shutdown();
        private:
                GLFWwindow* m_Window;

                struct WindowData
                {
                        std::string Title;
                        unsigned int Width, Height;
                        bool VSync;

                        EventCallbackFn EventCallback;
                };

                WindowData m_Data;
        };

}
```

WindowsWindow.h主要用于实现Window.h中的内容，这里多一个WindowData结构体，用来包含其中的一些状态，方便使用，即`m_Data`。这样我们就可以只传递结构体，不用传递完整的类对象。

这里的`GLFWwindow* m_Window`和句柄有关，m_Window是GLFW库内部malloc出来的一块C结构体，内部包含了真正的Win32内核对象，本身并不是。

源码：


```C++
// GLFW 源码（src/internal.h）示意
struct _GLFWwindow {
    _GLFWplatform platform;   // 各平台专用子结构
    // 里面放着：
    //   Windows: HWND handle;  <-- 真正的内核句柄
    //   X11: Window x11handle;
    //   Wayland: struct wl_surface* surface;
    ...
};
```

可以注意到，GLFWwindow* m_Window实际上是指向这一块内存的指针，里面拿到了操作系统内核中的handle，也就是HWND。

WindowsWindow.cpp
```C++
#include "hzpch.h"
#include "WindowsWindow.h"

namespace Hazel {
        
        static bool s_GLFWInitialized = false;

        Window* Window::Create(const WindowProps& props)
        {
                return new WindowsWindow(props);
        }

        WindowsWindow::WindowsWindow(const WindowProps& props)
        {
                Init(props);
        }

        WindowsWindow::~WindowsWindow()
        {
                Shutdown();
        }

        void WindowsWindow::Init(const WindowProps& props)
        {
                m_Data.Title = props.Title;
                m_Data.Width = props.Width;
                m_Data.Height = props.Height;

                HZ_CORE_INFO("Creating window {0} ({1}, {2})", props.Title, props.Width, props.Height);

                if (!s_GLFWInitialized)
                {
                        int success = glfwInit();
                        HZ_CORE_ASSERT(success, "Could notintialize GLFW!");

                        s_GLFWInitialized = true;

                        m_Window = glfwCreateWindow((int)props.Width, (int)props.Height, m_Data.Title.c_str(), nullptr, nullptr);
                        glfwMakeContextCurrent(m_Window);
                        glfwSetWindowUserPointer(m_Window, &m_Data);
                        SetVSync(true);
                }
        }

        void WindowsWindow::Shutdown()
        {
                glfwDestroyWindow(m_Window);
        }

        void WindowsWindow::OnUpdate()
        {
                glfwPollEvents();
                glfwSwapBuffers(m_Window);
        }

        void WindowsWindow::SetVSync(bool enabled)
        {
                if (enabled)
                        glfwSwapInterval(1);
                else
                        glfwSwapInterval(0);

                m_Data.VSync = enabled;
        }

        bool WindowsWindow::IsVSync() const
        {
                return m_Data.VSync;
        }
}
```

`Init()`里面涉及到`if (!s_GLFWInitialized)`这个语句，主要是作为一个静态标志，防止重复的初始化GLFW，只初始化一次。`int success = glfwInit();`用来真正的初始化GLFW动态库，加载DLL，建立内部数据结构等。`m_Window = glfwCreateWindow((int)props.Width, (int)props.Height, m_Data.Title.c_str(), nullptr, nullptr);`创建一个底层原生窗口句柄，GLFW虽然只能初始化一次，但是`glfwCreateWindow()`可以调用多次，因此支持多窗口。`glfwMakeContextCurrent(m_Window)`则是把刚刚创建的窗口的OpenGL上下文设为当前线程的上下文，这样后续所有的OpenGL调用都会作用到这个窗口)。`glfwSetWindowUserPointer(m_Window, &m_Data)`，把Hazel自己定义的WindowData结构体指针存到GLFW的窗口句柄里，实现“反向绑定”。之后在 GLFW 的回调里可以通过`glfwGetWindowUserPointer`取回`m_Data`，从而拿到Hazel的WindowsWindow实例，做事件分发。

`glfwPollEvents();`把操作系统这次派发的鼠标、键盘、窗口尺寸等事件全部取出来，分发给前面注册的回调函数，驱动整个事件系统往前走。`glfwSwapBuffers(m_Window);`把刚才 OpenGL 渲染好的 back-buffer 与 front-buffer 交换，真正显示到屏幕上；同时按当前垂直同步设置阻塞或不阻塞，控制帧率。

`void WindowsWindow::SetVSync(bool enabled)`：运行时动态开关垂直同步。

#### 尝试使用

Application.h
```C++
//添加新的引入库
#include "Window.h"

//创建一个指针用来指
class HAZEL_API Application
{
public:
    Application();
    virtual ~Application();

    void Run();
    //创建一个指针用来指（在这里）
private:
    std::unique_ptr<Window> m_Window;
};
```

在Application.cpp中加入东西

Application.cpp
```C++
//在构造函数中添加
Application::Application()
{
    m_Window = std::unique_ptr<Window>(Window::Create());
}
......
//在Run函数中添加
void Application::Run()
{
    while (m_Running)
    {
        m_Window->OnUpdate();
    }
}
```

  

#### 出现的神秘BUG

1.报了一大堆有关于符号解析的错，原因是使用的编译有问题，打开属性，C/C++，代码生成将运行库修改为多线程DLL即可，似乎是因为编译MinGW和MSVC有问题。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314221708.png)

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314221712.png)

2.Sandbox报错，原因是因为没有加预编译头，解决方式是自己模仿改一个预编译器……，能用就行（不过不知道为什么报了个冲突，直接勾选一个允许Hazel.dll得了，好吧不行，这个后续也必须要解决）

premake.lua
```Lua
project "Sandbox"
    location "Sandbox"
    kind "ConsoleApp"
    language "C++"

    targetdir ("bin/".. outputdir .. "/%{prj.name}")
    objdir ("bin-int/".. outputdir .. "/%{prj.name}")

    pchheader "sandpch.h"
    pchsource "Sandbox/src/sandpch.cpp"

    files
    {
        "%{prj.name}/src/**.h",
        "%{prj.name}/src/**.cpp"
    }

    includedirs
    {
        "Hazel/vendor/spdlog/include",
        "Hazel/src"
    }

    links
    {
        "Hazel"
    }

    filter "system:windows"
        cppdialect "c++17"
        staticruntime "On"
        systemversion "latest"

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

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314222001.png)

3.为什么会报ostream的错，以及一些神秘的错误（来自Events事件文件夹的头文件们），答案是这些文件在自嗨，完全没有cpp使用他们，还没编译呢（

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314222008.png)

4.神秘的报错！以及解决，答案是Hazel和Sandbox都需要配置一样的运行时库，当时Hazel.dll配置为了/MD，而Sandbox.exe被配置为了其他的，应该都修改为/MD。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314222028.png)

（思索，所以是不是可以不要Sandbox的预编译，直接都用/MD就可以了？）

（好吧不行）

最后效果如下：成功启动了引擎！

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314222042.png)

可以继续修改看一些其他的情况，最终版本：

Application.cpp
```C++
#include "hzpch.h"
#include "Application.h"

#include "Hazel/Events/ApplicationEvent.h"
#include "Hazel/Log.h"

#include<GLFW/glfw3.h>

namespace Hazel
{
    Application::Application()
    {
        m_Window = std::unique_ptr<Window>(Window::Create());
    }

    Application::~Application()
    {
    }

    void Application::Run()
    {
        while (m_Running)
        {
            glClearColor(1, 0, 1, 1);
            glClear(GL_COLOR_BUFFER_BIT);
            m_Window->OnUpdate();
        }
    }
}
```
