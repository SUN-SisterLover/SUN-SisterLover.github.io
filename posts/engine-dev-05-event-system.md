---
id: engine-dev-05-event-system
index: '23'
title_zh: '【游戏引擎开发】事件系统'
title_en: 'Game Engine Dev 05: Event System'
excerpt_zh: '接下来我们要做的事情就是为引擎构建一个事件系统，以便能够处理与窗口相关的事件，例如窗口关闭、窗口被提升、输入事件、鼠标和键盘事件等。'
excerpt_en: 'Building an event system to handle window close, resize, input, mouse and keyboard events.'
tags: ['游戏引擎', '计算机图形学', '项目', 'OpenGL']
date: '2026.03.14'
readTime: '2 min'
---

# 事件系统

#### 构建事件系统

接下来我们要做的事情就是为引擎构建一个事件系统，以便能够处理与窗口相关的事件，例如窗口关闭、窗口被提升、输入事件、鼠标和键盘事件等。

【008的视频没看，瞅了一眼很困，还是直接进入code吧】

在Hazel文件夹下创建一个Events文件夹，其中Event.h是核心代码。这里以后还有ApplicationEvent.h，MoushEvent.h，KeyEvent.h之类的，用于写这些具体事件。

首先这是一个非缓冲的设计，事件并不是被延迟的，一旦他们发生（比如鼠标一点击），就会立刻响应，整个应用程序基本就会停止运行，然后处理这个事件。

【我们先不放出完整的代码，先对代码的架构进行一个了解】

```C++
enum class EventType
{
        None = 0,
        WindowClose, WindowResize, WindowFocus, WindowLostFocus, WindowMoved,
        AppTick, AppUpdate, AppRender,
        KeyPressed, KeyReleased,
        MouseButtonPressed, MouseButtonReleased, MouseMoved, MouseScrolled
};
```

这里是一套枚举类，规定了能触发的所有事件的名称，这些名称所对应的功能将会在其他代码中一一进行实现。

```C++
enum EventCategory
{
        None = 0,
        EventCategoryApplication    = BIT(0),
        EventCategoryInput          = BIT(1),
        EventCategoryKeyboard       = BIT(2),
        EventCategoryMouse          = BIT(3),
        EventCategoryMouseButton    = BIT(4)
};
```

这里是事件类型，因为我们可能想过要过滤掉某些事件。比如我的应用程序接受所有事件到某种事件类，但我只关心键盘事件。这里的BIT()是我们在Core.h中定义出来的一个位域，这里打开Hazel文件夹目录下的Core.h，添加一个`#define BIT(x) (1 << x)`。利用这种方式可以让一个事件能有多个分类。

这里需要查一下是为什么能让有多个分类。

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

#define BIT(x) (1 << x)
```

```C++
class HAZEL_API Event
{
        friend class EventDispatcher;
public:
        virtual EventType GetEventType() const = 0;//事件类型
        virtual const char* GetName() const = 0;//事件名称
        virtual int GetCategoryFlags() const = 0;//类别
        virtual std::string ToString() const { return GetName(); }//其实是用来调试的，主要是打印名称

        //用于判断是否属于某个类别
        inline bool IsInCategory(EventCategory category)
        {
                return GetCategoryFlags() & category;
        }
protected:
        bool m_Handled = false;
};
```

这是一个基本的事件类，同时还存储了一个处理状态布尔值，因为我们需要判断一个事件是否被处理了。因为当我们把事件传播到不同的层的时候可能会思考是否让其继续传播。（比如当UI层上面有一个按钮，我们鼠标点击了，而鼠标正好在按钮的范围内，这个事件就已经被处理了。而我们希望处理这个事件，以便下面的层（游戏层），但是不会是点击事件，因为已经被我们处理了。

`GetName()`是一个单纯的主要是用于调试的代码，假设我们想要打印更多的细节，比如窗口的大小。这里距离了ApplicationEvent.h中的代码，重写了ToString()，从而可以打印窗口的大小。

这个ToString其实偏向调试，毕竟要调用字符串，并不是说在性能上很糟糕，主要是它可能会分配内存。不过这里我们就是作为调试来使用，不会运行在调试之外的情况，

ApplicationEvent.h的部分代码
```C++
class HAZEL_API WindowResizeEvent : public Event
{
public:
        WindowResizeEvent(unsigned int width, unsigned int height)
                : m_Width(width), m_Height(height) {}

        inline unsigned int GetWidth() const { return m_Width; }
        inline unsigned int GetHeight() const { return m_Height; }

        std::string ToString() const override
        {
                std::stringstream ss;
                ss << "WindowResizeEvent: " << m_Width << ", " << m_Height;
                return ss.str();
        }

        EVENT_CLASS_TYPE(WindowResize)
        EVENT_CLASS_CATEGORY(EventCategoryApplication)
private:
        unsigned int m_Width, m_Height;
};
```

实际上在编写这些具体的类的时候我们为了化简，所以会直接使用宏来做这些事情，而不是手动的去对这些虚函数之类的进行操作，节省操作。

```C++
#define EVENT_CLASS_TYPE(type) static EventType GetStaticType() { return EventType::##type; }\
                                                                virtual EventType GetEventType() const override { return GetStaticType(); }\
                                                                virtual const char* GetName() const override { return #type; }

#define EVENT_CLASS_CATEGORY(category) virtual int GetCategoryFlags() const override { return category; }
```

通过`EVENT_CLASS_TYPE`这个宏，确定事件类的类型。这里`GetEventType()`则是希望我们依旧是通过最大的Event来判断是哪一个类型的，一个多态的使用。

Event.h中的调度器
```C++
class EventDispatcher
{
        template<typename T>
        using EventFn = std::function<bool(T&)>;
public:
        EventDispatcher(Event& event)
                : m_Event(event)
        {
        }

        template<typename T>
        bool Dispatch(EventFn<T> func)
        {
                if (m_Event.GetEventType() == T::GetStaticType())
                {
                        m_Event.m_Handled = func(*(T*)&m_Event);
                        return true;
                }
                return false;
        }
private:
        Event& m_Event;
};
```

调度器是一种让我们根据事件类型轻松分发事件的方法，【这里后面解释加强，因为有模板函数之类的东西，要复习一下C++】

#### 一些修改和最后的代码

premake.lua
```Lua
//使用最新的版本
systemverison "latest"

//Hazel的加一个地址
includedirs
{
    "%{prj.name}/src",
    "%{prj.name}/vendor/spdlog/include"
}
```

Application.h
```C++
//新增包含
#include "Events/Event.h"
```

Application.cpp
```C++
#include "Application.h"

#include "Hazel/Events/ApplicationEvent.h"
#include "Hazel/Log.h"

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
        WindowResizeEvent e(1280, 720);
        HZ_TRACE("{}", e.ToString());
        if (e.IsInCategory(EventCategoryApplication))
        {
            HZ_TRACE("{}", e.ToString());
        }
        if (e.IsInCategory(EventCategoryInput))
        {
            HZ_TRACE("{}", e.ToString());
        }


        while (true);
    }
}
```

Log.h
```C++
//新增包含
#include "spdlog/fmt/ostr.h"
```

在ApplicationEvent.h中，我们使用的是e，这里在日志中使用了e.ToString，因为如果不这样使用会出现报错。这是因为日志库文件中我们使用了fmt，没有提供对外直接的关于e的接口，我们需要先将其转化为字符串格式。

所以需要将`HZ_TRACE(e)`修改为`HZ_TRACE("{}", e.ToString())`

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314215543.png)

Event.h
```C++
#pragma once

#include "Hazel/Core.h"

#include <string>
#include <functional>

namespace Hazel {

        enum class EventType
        {
                None = 0,
                WindowClose, WindowResize, WindowFocus, WindowLostFocus, WindowMoved,
                AppTick, AppUpdate, AppRender,
                KeyPressed, KeyReleased,
                MouseButtonPressed, MouseButtonReleased, MouseMoved, MouseScrolled
        };

        enum EventCategory
        {
                None = 0,
                EventCategoryApplication    = BIT(0),
                EventCategoryInput          = BIT(1),
                EventCategoryKeyboard       = BIT(2),
                EventCategoryMouse          = BIT(3),
                EventCategoryMouseButton    = BIT(4)
        };

#define EVENT_CLASS_TYPE(type) static EventType GetStaticType() { return EventType::##type; }\
                                                                virtual EventType GetEventType() const override { return GetStaticType(); }\
                                                                virtual const char* GetName() const override { return #type; }

#define EVENT_CLASS_CATEGORY(category) virtual int GetCategoryFlags() const override { return category; }

        class HAZEL_API Event
        {
                friend class EventDispatcher;
        public:
                virtual EventType GetEventType() const = 0;
                virtual const char* GetName() const = 0;
                virtual int GetCategoryFlags() const = 0;
                virtual std::string ToString() const { return GetName(); }

                inline bool IsInCategory(EventCategory category)
                {
                        return GetCategoryFlags() & category;
                }
        protected:
                bool m_Handled = false;
        };

        class EventDispatcher
        {
                template<typename T>
                using EventFn = std::function<bool(T&)>;
        public:
                EventDispatcher(Event& event)
                        : m_Event(event)
                {
                }

                template<typename T>
                bool Dispatch(EventFn<T> func)
                {
                        if (m_Event.GetEventType() == T::GetStaticType())
                        {
                                m_Event.m_Handled = func(*(T*)&m_Event);
                                return true;
                        }
                        return false;
                }
        private:
                Event& m_Event;
        };

        inline std::ostream& operator << (std::ostream& os, const Event& e)
        {
                return os << e.ToString();
        }


}
```

ApplicationEvent.h
```C++
#pragma once

#include "Event.h"

#include<sstream>

namespace Hazel {
        class HAZEL_API WindowResizeEvent : public Event
        {
        public:
                WindowResizeEvent(unsigned int width, unsigned int height)
                        : m_Width(width), m_Height(height) {}

                inline unsigned int GetWidth() const { return m_Width; }
                inline unsigned int GetHeight() const { return m_Height; }

                std::string ToString() const override
                {
                        std::stringstream ss;
                        ss << "WindowResizeEvent: " << m_Width << ", " << m_Height;
                        return ss.str();
                }

                EVENT_CLASS_TYPE(WindowResize)
                EVENT_CLASS_CATEGORY(EventCategoryApplication)
        private:
                unsigned int m_Width, m_Height;
        };

        class HAZEL_API WindowCloseEvent : public Event
        {
        public:
                WindowCloseEvent() {}

                EVENT_CLASS_TYPE(WindowClose)
                EVENT_CLASS_CATEGORY(EventCategoryApplication)
        };

        class HAZEL_API AppTickEvent : public Event
        {
        public:
                AppTickEvent() {}

                EVENT_CLASS_TYPE(AppTick)
                EVENT_CLASS_CATEGORY(EventCategoryApplication)
        };
        
        class HAZEL_API AppUpdateEvent : public Event
        {
        public:
                AppUpdateEvent() {}

                EVENT_CLASS_TYPE(AppUpdate)
                EVENT_CLASS_CATEGORY(EventCategoryApplication)
        };

        class HAZEL_API AppRenderEvent : public Event
        {
        public:
                AppRenderEvent() {}

                EVENT_CLASS_TYPE(AppRender)
                EVENT_CLASS_CATEGORY(EventCategoryApplication)
        };
}
```

KeyEvent.h
```C++
#pragma once

#include "Event.h"

#include <sstream>

namespace Hazel {
        
        class HAZEL_API KeyEvent : public Event
        {
        public:
                inline int GetKeyCode() const { return m_KeyCode; }
                
                EVENT_CLASS_CATEGORY(EventCategoryKeyboard | EventCategoryInput)
        protected:
                KeyEvent(int keycode)
                        : m_KeyCode(keycode) {}

                int m_KeyCode;
        };

        class HAZEL_API KeyPressedEvent : public KeyEvent
        {
        public:
                KeyPressedEvent(int keycode, int repeatCount)
                        : KeyEvent(keycode), m_RepeatCount(repeatCount) {}

                inline int GetRepeatCount() const { return m_RepeatCount; }

                std::string ToString() const override
                {
                        std::stringstream ss;
                        ss << "KeyPressedEvent: " << m_KeyCode << " (" << m_RepeatCount << " repeats)";
                        return ss.str();
                }

                EVENT_CLASS_TYPE(KeyPressed)
        private:
                int m_RepeatCount;
        };

        class HAZEL_API KeyReleasedEvent : public KeyEvent
        {
        public:
                KeyReleasedEvent(int keycode)
                        : KeyEvent(keycode) {}

                std::string ToString() const override
                {
                        std::stringstream ss;
                        ss << "KeyReleasedEvent: " << m_KeyCode;
                        return ss.str();
                }

                EVENT_CLASS_TYPE(KeyReleased);
        };
}
```

MouseEvent.h
```C++
#pragma once

#include "Event.h"

#include <sstream>

namespace Hazel {
        class HAZEL_API MouseMovedEvent : public Event
        {
        public:
                MouseMovedEvent(float x, float y)
                        : m_MouseX(x), m_MouseY(y) {}

                inline float GetX() const { return m_MouseX; }
                inline float GetY() const { return m_MouseY; }

                std::string ToString() const override
                {
                        std::stringstream ss;
                        ss << "MouseMovedEvent: " << m_MouseX << ", " << m_MouseY;
                        return ss.str();
                }

                EVENT_CLASS_TYPE(MouseMoved)
                EVENT_CLASS_CATEGORY(EventCategoryMouse | EventCategoryInput)
        private:
                float m_MouseX, m_MouseY;

        };

        class HAZEL_API MouseScrolledEvent : public Event
        {
        public:
                MouseScrolledEvent(float xOffset, float yOffset)
                        : m_XOffset(xOffset), m_YOffset(yOffset) {}

                inline float GetXOffset() const { return m_XOffset; }
                inline float GetYOffset() const { return m_YOffset; }

                std::string ToString() const override
                {
                        std::stringstream ss;
                        ss << "MouseScrolledEvent: " << GetXOffset() << ", " << GetYOffset();
                        return ss.str();
                }

                EVENT_CLASS_TYPE(MouseScrolled)
                EVENT_CLASS_CATEGORY(EventCategoryMouse | EventCategoryInput)
        private:
                float m_XOffset, m_YOffset;
        };

        class HAZEL_API MouseButtonEvent : public Event
        {
        public:
                inline int GetMouseButton() const { return m_Button; }

                EVENT_CLASS_CATEGORY(EventCategoryMouse | EventCategoryInput)
        protected:
                MouseButtonEvent(int button)
                        : m_Button(button) {}

                int m_Button;
        };

        class HAZEL_API MouseButtonPressedEvent : public MouseButtonEvent
        {
        public:
                MouseButtonPressedEvent(int button)
                        : MouseButtonEvent(button) {}

                std::string ToString() const override
                {
                        std::stringstream ss;
                        ss << "MouseButtonPressedEvent: " << m_Button;
                        return ss.str();
                }

                EVENT_CLASS_TYPE(MouseButtonPressed)
        };

        class HAZEL_API MouseButtonReleasedEvent : public MouseButtonEvent
        {
        public:
                MouseButtonReleasedEvent(int button)
                        : MouseButtonEvent(button) {}

                std::string ToString() const override
                {
                        std::stringstream ss;
                        ss << "MouseButtonReleasedEvent: " << m_Button;
                        return ss.str();
                }

                EVENT_CLASS_TYPE(MouseButtonReleased)
        };
}
```
