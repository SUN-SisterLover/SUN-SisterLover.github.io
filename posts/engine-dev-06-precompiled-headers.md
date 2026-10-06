---
id: engine-dev-06-precompiled-headers
index: '24'
title_zh: '【游戏引擎开发】预编译头文件'
title_en: 'Game Engine Dev 06: Precompiled Headers'
excerpt_zh: '在Hazel的src目录下直接创建一个hzpch.cpp和hzpch.h，在里面放下一些需要使用的头文件等。'
excerpt_en: 'Creating hzpch.cpp and hzpch.h to hold the commonly used headers.'
tags: ['游戏引擎', '计算机图形学', '项目', 'OpenGL']
date: '2026.03.14'
readTime: '1 min'
---

# 预编译头文件

在Hazel的src目录下直接创建一个hzpch.cpp和hzpch.h，在里面放下一些需要使用的头文件等。

hzpch.h
```C++
#pragma once

#include <iostream>
#include <memory>
#include <utility>
#include <algorithm>
#include <functional>

#include <string>
#include <sstream>
#include <vector>
#include <unordered_map>
#include <unordered_set>

#ifdef HZ_PLATFORM_WINDOWS
        #include <Windows.h>
#endif
```

这个hzpch.h是直接针对windows平台的，以后我们会使用这个头。

**接下来打开我们之前的所有文件，将其中涉及到的直接删掉！**

接下来我们对之前的premake文件进行修改，修改如下：

```Lua
project "Hazel"
        location "Hazel"
        kind "SharedLib"
        language "C++"

        targetdir ("bin/".. outputdir .. "/%{prj.name}")
        objdir ("bin-int/".. outputdir .. "/%{prj.name}")
        
        //从这里开始修改
        pchheader "hzpch.h"
        pchsource "Hazel/src/hzpch.cpp"
```

这一修改相当于选择了预编译头（如下，不用这样操作，只是说明是在做什么）。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314220747.png)

此时我们打开hzpch.cpp的属性，可以看到这里被标记为已经创建：

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260314220803.png)

随后我们在Application.cpp和Log.cpp中添加`#include "hzpch.h"`进行对Hazel的构建，可以发现构建成功。

使用这一方式的好处是可以加速构建，虽然此时项目不能正常运转（后面会调整的。

这一块记得使用bat重构项目。
