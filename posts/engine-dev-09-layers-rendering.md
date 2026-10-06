---
id: engine-dev-09-layers-rendering
index: '27'
title_zh: '【游戏引擎开发】图层与渲染'
title_en: 'Game Engine Dev 09: Layers and Rendering'
excerpt_zh: '我们首先要理解顺序，如果我们以事件来说，先渲染谁，再渲染谁，那么他们有个顺序123456……大概这样。但是图层是后渲染的在先渲染的前面，所以实际上我们渲染的顺序'
excerpt_en: 'Render order matters — later layers are drawn on top of earlier ones.'
tags: ['游戏引擎', '计算机图形学', '项目', 'OpenGL']
date: '2026.03.14'
readTime: '1 min'
---

我们首先要理解顺序，如果我们以事件来说，先渲染谁，再渲染谁，那么他们有个顺序123456……大概这样。但是图层是后渲染的在先渲染的前面，所以实际上我们渲染的顺序应该是987654……

#### 新增的代码

在Hazel文件夹下创建了四套代码，Layer.h，Layer.cpp，LayerStack.h，LayerStack.cpp。

layer.h
```C++
#pragma once

#include "Hazel/Core.h"
#include "Hazel/Events/Event.h"

namespace Hazel {

        class HAZEL_API Layer
        {
        public:
                Layer(const std::string& name = "Layer");
                virtual ~Layer();

                virtual void OnAttach() {}
                virtual void OnDetach() {}
                virtual void OnUpdate() {}
                virtual void OnEvent(Event& event) {}

                inline const std::string& GetName() const { return m_DebugName; }
        protected:
                std::string m_DebugName;
        };
}
```

Layer.cpp
```C++
#include "hzpch.h"
#include "Layer.h"

namespace Hazel {

        Layer::Layer(const std::string& debugName)
                : m_DebugName(debugName)
        {
        }

        Layer::~Layer()
        {
        }
}
```

LayerStack.h
```C++
#pragma once

#include "Hazel/Core.h"
#include "Layer.h"

#include <vector>

namespace Hazel {

        class HAZEL_API LayerStack
        {
        public:
                LayerStack();
                ~LayerStack();

                void PushLayer(Layer* layer);
                void PushOverlay(Layer* overlay);
                void PopLayer(Layer* layer);
                void PopOverlay(Layer* overlay);

                std::vector<Layer*>::iterator begin() { return m_Layers.begin(); }
                std::vector<Layer*>::iterator end() { return m_Layers.end(); }

        private:
                std::vector<Layer*> m_Layers;
                std::vector<Layer*>::iterator m_LayerInsert;
        };
}
```

分为两套层，一个普通Layer（给GamePlay），一个OverLay（给Debug，ImGui之类的）（总之最后画）。

`std::vector<Layer*>::iterator begin() { return m_Layers.begin(); }`

`std::vector<Layer*>::iterator end() { return m_Layers.end(); }`

是为了把`LayerStack`包装成一个可迭代容器，对外暴露的就是这个底层的vector<Layer*>的起止迭代器。

`m_Layers`和`m_LayerInsert`分别是层指针数组和普通层与OverLay的分界层

layerStack.cpp
```C++
#include "hzpch.h"
#include "LayerStack.h"

namespace Hazel {
        
        LayerStack::LayerStack()
        {
                m_LayerInsert = m_Layers.begin();
        }

        LayerStack::~LayerStack()
        {
                for (Layer* layer : m_Layers)
                        delete layer;
        }

        void LayerStack::PushLayer(Layer* layer)
        {
                m_LayerInsert = m_Layers.emplace(m_LayerInsert, layer);
        }

        void LayerStack::PushOverlay(Layer* overlay)
        {
                m_Layers.emplace_back(overlay);
        }

        void LayerStack::PopLayer(Layer* layer)
        {
                auto it = std::find(m_Layers.begin(), m_Layers.end(), layer);
                if (it != m_Layers.end())
                {
                        m_Layers.erase(it);
                        m_LayerInsert--;
                }
        }

        void LayerStack::PopOverlay(Layer* overlay)
        {
                auto it = std::find(m_Layers.begin(), m_Layers.end(), overlay);
                if (it != m_Layers.end())
                        m_Layers.erase(it);
        }
}
```

普通Layer和OverLay分别从begin和end进入，m_LayerInsert永远指向第一个OverLay，遍历顺序即从游戏逻辑到调试UI。
#### 其他的修改部分

Application.h
```C++
#pragma once

#include "Core.h"
#include "Window.h"
#include "Hazel/LayerStack.h"
#include "Hazel/Events/Event.h"
#include "Hazel/Events/ApplicationEvent.h"

namespace Hazel
{
    class HAZEL_API Application
    {
    public:
        Application();
        virtual ~Application();

        void Run();

        void OnEvent(Event& e);

        void PushLayer(Layer* layer);
        void PushOverlay(Layer* layer);
    private:
        bool OnWindowClose(WindowCloseEvent& e);

        std::unique_ptr<Window> m_Window;
        bool m_Running = true;
        LayerStack m_LayerStack;
    };

    //去定义在客户端中
    Application* CreateApplication();
}
```

Application.cpp
```C++
#include "hzpch.h"
#include "Application.h"


#include "Hazel/Log.h"

#include<GLFW/glfw3.h>

namespace Hazel
{
#define BIND_EVENT_FN(x) std::bind(&Application::x, this, std::placeholders::_1)

    Application::Application()
    {
        m_Window = std::unique_ptr<Window>(Window::Create());
        m_Window->SetEventCallback(BIND_EVENT_FN(OnEvent));
    }

    Application::~Application()
    {
    }

    void Application::PushLayer(Layer* layer)
    {
        m_LayerStack.PushLayer(layer);
    }

    void Application::PushOverlay(Layer* layer)
    {
        m_LayerStack.PushOverlay(layer);
    }

    void Application::OnEvent(Event& e)
    {
        EventDispatcher dispatcher(e);
        dispatcher.Dispatch<WindowCloseEvent>(BIND_EVENT_FN(OnWindowClose));

        HZ_CORE_TRACE("{0}", e.ToString());

        for (auto it = m_LayerStack.end(); it != m_LayerStack.begin();)
        {
            (*--it)->OnEvent(e);
            if (e.Handled)
                break;
        }
    }

    void Application::Run()
    {
        while (m_Running)
        {
            glClearColor(1, 0, 1, 1);
            glClear(GL_COLOR_BUFFER_BIT);

            for (Layer* layer : m_LayerStack)
                layer->OnUpdate();
            m_Window->OnUpdate();
        }
    }

    bool Application::OnWindowClose(WindowCloseEvent& e)
    {
        m_Running = false;
        return true;
    }
}
```

Hazel.h
```C++
#pragma once

//For use by Hazel application

#include "Hazel/Application.h"
#include "Hazel/Layer.h"
#include "Hazel/Log.h"

//------EntryPoint---------------------
#include "Hazel/EntryPoint.h"
//-------------------------------------
```

关于之前有关于本身构建的问题：（我们统一将两个项目Hazel和Sandbox都修改添加一行buildoptions。（这东西貌似也能填/utf-8，后面研究一下）

```Lua
filter "configurations:Debug"
        defines "HZ_DEBUG"
        buildoptions "/MDd"
        symbols "On"

filter "configurations:Release"
        defines "HZ_RELEASE"
        buildoptions "/MD"
        symbols "On"

filter "configurations:Dist"
        defines "HZ_DIST"
        buildoptions "/MD"
        symbols "On"
```

sandbox的代码先不提，这里有个bug：

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314234339.png)

看了一下源码，似乎是偷偷把之前的m_Handled（在Event.h中）改成了Handled，同时将其protected的权限改为了公开的！这里要改一下！

Sandbox.cpp
```C++
#include "sandpch.h"
#include <Hazel.h>


class ExampleLayer : public Hazel::Layer
{
public:
    ExampleLayer()
        : Layer("Example")
    {
    }

    void OnUpdate() override
    {
        HZ_INFO("ExampleLayer::Update");
    }

    void OnEvent(Hazel::Event& event) override
    {
        HZ_TRACE("{0}", event.ToString());
    }
};

class Sandbox : public Hazel::Application
{
public:
    Sandbox()
    {
        PushLayer(new ExampleLayer());
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
