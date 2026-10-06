---
id: shader-syntax
index: '06'
title_zh: 'Shader语法'
title_en: 'Shader Syntax'
excerpt_zh: 'Shader是一个更通用的概念，用来描述图形渲染程序中的着色器程序。而Unity Shader特指在Unity中使用的着色器。Unity Shader可以理解为'
excerpt_en: 'Shader is a general concept for shading programs; Unity Shader refers specifically to the shaders used in Unity.'
tags: ['Unity', 'Shader', '渲染']
date: '2025.05.30'
readTime: '7 min'
---

# ShaderLab

## 基本介绍

Shader是一个更通用的概念，用来描述图形渲染程序中的着色器程序。而Unity Shader特指在Unity中使用的着色器。Unity Shader可以理解为对Shader的一种封装，提供了一种叫做ShaderLab的语言，来更加轻松的编写和管理着色器。
想要在Unity中体现出一个Shader的渲染效果，就需要配合使用材质(Material)和Shader(Unity Shader)才能达到目标，一般流程是：
1.创建一个材质
2.创建一个Unity Shader，把该Shader赋给上一步中创建的材质
3.将材质赋予给想要渲染的对象
4.在材质面板中调整Unity Shader的相关属性，以达到最终效果
在Unity中创建对应材质后，需要将其拖给对象的Mesh网络使用。这里可以选择材质使用哪种着色器，以及该着色器提供的可变化的对应属性。
在Project窗口中右键创建Shader：Create->Shader
1.StandardSurfaceShader（标准曲面着色器）——包含标准光照模型的表面着色器模板
2.Unlit Shader——不包含光照的基本顶点/片元着色器
3.Image Effect Shader——用于实现屏幕后处理效果的基本模板
4.Compute Shader——利用GPU并行计算一些和常规渲染流水线无关的内容
5.Ray Tracing Shader——用于实现光线追踪效果的着色器
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220181946.png)
1.DefaultMaps:默认纹理
在这里我们可以设置着色器使用的默认纹理图片，第一次使用该Shader时，这些纹理会自动的赋予到对应的属性上。
2.Imported Object：导入的对象
这里可以查看和编辑与着色器对象本身相关的设置，以及着色器编译器如何处理它
3.Surface Shader(表面着色器）Show generated code(显示生成的代码)
如果是表面着色器，这里可以点击对应的按钮，在这里可以查看对应的代码
4.Fixedfunction：是否使用固定管线进行渲染（非常老的版本使用的方式）
5.Preprocess only：是否开启预处理阶段执行特定代码标记
6.Strip /#line directives(开启Preprocess only后出现)：
开启后，编译器会在生成的代码中删除所有的“#line”指令，以确保调试和错误定位的准确性
7.Compiled code(Compile and show code)：编译并显示代码
可以查看在不同平台时使用不同的图形接口程序时编译出来的代码，可以帮助我们优化着色器性能
8.Cast shadows:是否投射阴影
9.Renderqueue：该Shader的渲染队列，决定渲染顺序
10.LOD:LOD级别
11.Ignore projector:是否忽略投影器
12.Disablebatching:是否禁用批处理
13.Keywords：是一种用于在渲染过程中启用或禁用特定功能的设置，通过在Shader中定义关键字，你可以在运行时动态地切换不同的渲染通道、特效或选项，以实现多样化的视觉效果
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182043.png)
在材质窗口中，可以选择需要使用的Shader，并且附上贴图后，观察效果。
## ShaderLab属性
```TypeScript
//第一部分
Shader "着色器名字"//这里通过/可以改位置，比如Unlit/Shader1
{
    //第二部分
    Properties
    {
        //材质面板上可以看到的属性
    }
    
    //第三部分
    SubShader
    {
        //顶点-片段着色器 或 表面着色器 或 固定函数着色器
    }
    SubShader
    {
        //更加精简的版本
        //目的是适配旧设备
    }
    ......可以有n个SubShader代码块
    
    //第四部分
    Fallback "备用的Shader"
}
```
tips：创建Shader文件时是可以进行命名的，此时的命名并非Shader真正的名字，Shader真正的名字是文件中第一部分Shader "真正的名字（以及路径）"。
第二部分的内容会在材质中现实，可以被我们编辑。
第三部分有很多个SubShader子着色器，目的是为了适配更多的平台。
如果第三部分子着色器无法使用，就会调用第四部分的备用Shader。
**Shader的属性的作用：**
在Shader编写时我们经常会用到不同类型的变量或贴图等资源，为了增加shader的可调节性，有些变量不会直接在shader程序中写死，而是作为开放的属性显示在我们的材质面板上，供我们使用时调节，而这些开放的属性就是通过属性来定义的，Shader的属性具有两个特点：
1.可以在材质面板被编辑
2.可以在后续当作输入变量提供给所有子着色器使用
Shader属性是存在于shader语句块中的Properties属性语句块，我们只需要在Properties语句块中按照语法规则声明属性即可，UnityShader的属性主要分成三大类：数值、颜色和向量、纹理贴图。
**数值类型**
属性的基础语法
```TypeScript
_Name("Display Name", type) = defaultValue[{options}]
//_Name：属性名字，规则是需要在前面加上一个下划线，方便之后获取
//Display Name：材质面板上显示的名字
//type：属性的类型
//defaultValue：将Shader指定给材质的时候初始化的默认值
```
数值类型
```TypeScript
//数值类型有三种：整型，浮点型，范围浮点型
_Name("Display Name", Int) = number//编译的时候还是会转化为浮点
_Name("Display Name", Float) = number
_Name("Display Name", Range(min,max)) = number
```
在Shader中编写一下代码：
```TypeScript
Properties
{
    _MainTex ("Texture", 2D) = "white" {}
    _MyInt("MyInt", Int) = 1
    _MyFloat("MyFloat", Float) = 0.5
    _MyRange("MyRange", Range(1, 5)) = 2
}
```
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182248.png)
可见材质选中Shader文件Lesson4后，出现了图中所示的内容。
**颜色和向量类型**
```TypeScript
//颜色值中RGBA的取值范围是0~1，映射到0~255中
_Name("Display Name", Color) = (number1, number2, number3, number4)
//向量值XYZW的取值范围没有限制
_Name("Display Name", Vector) = (number1, number2, number3, number4)
```
不展示Unity内情况了
**纹理贴图类型**
```TypeScript
//2D纹理(最常用的纹理，漫反射贴图、法线贴图都属于2D纹理）
_Name("Display Name", 2D) = "defaulttexture"{}
//2DArray纹理（纹理数组，允许在纹理中存储多层图像数据，较少使用）
_Name("Display Name", 2DArray) = "defaulttexture"{}
//Cube map texture（立方体纹理，由前后左右上下六张有联系的2D贴图拼成的立方体，如天空盒和反射探针）
_Name("Display Name", Cube) = "defaulttexture"{}
//3D纹理（一般使用脚本创建，较少使用）
_Name("Display Name", 3D) = "defaulttexture"{}

//defaulttexture默认取值
//white：默认白色贴图(RGBA：1，1，1，1)
//black：默认黑色贴图（RGBA：0，0，0，1）
//gray：默认灰色贴图（RGBA：0.5，0.5，0.5，1）
//bump：默认凸贴图（RGBA：0.5，0.5，1，1），一般用于法线贴图默认贴图
//red：默认红色贴图（RGBA：1，0，0，1）
```
## Shader的子着色器

Shader子着色器由三个部分组成，Tags渲染标签、States渲染状态、Pass渲染通道（渲染通道至少得有一个）

**Tags渲染标签**
```TypeScript
//标签的结构如下，可以使用任意多个标签
Tags = { "TagName1" = "Value1" "TagName2" = "Value2" ......}
```
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182332.png)
**States渲染状态**
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182339.png)
深度测试可以细看一下喵！（这里没有补充）
**Pass渲染通道**
这里就不详细解读了，等实际操作Shader代码的时候再精讲。
**Fallback**
如果一块显卡都运行不了，就会自动使用Fallback的方法喵！
## （扩展，不完整）实操Shader代码基础
以下内容通过学习Kerry佬的CS0102:Shader代码基础整理：
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182359.png)
<center>非常重要的一张图，我们需要通过该图来理解代码编写</center>

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182422.png)
<center>顶点Shader需要做的事情</center>

### 颜色和基本代码
解释都放在代码里使用注释讲解
```TypeScript
Shader "TechShader/01MiniShader"
{
    //这里是一些基本的属性
    Properties
    {
        _Color("Color", Color) = (0.5,0.5,0.5,0.5)
    }
    //子着色器
    SubShader
    {
        Pass
        {
            //在CGPROGRAM和ENDCG中编写代码
            CGPROGRAM
            //这两段编译指定了顶点着色器和片元着色器
            #pragma vertex vert
            #pragma fragment frag
            //一些库函数，用于帮助使用
            #include "UnityCG.cginc"

            //从CPU端拿走需要的数据，这里是拿走顶点坐标，对应图中的1
            //有时候也会携程a2v，意思是application to vertex shader，把数据传到顶点着色器
            struct appdata
            {
                float4 vertex : POSITION;
            };
            
            //vertex to(two) fragment，这是我们要输出的结构体，对应图中的3
            struct v2f
            {
                float4 pos : SV_POSITION;
            };
            //如果想要使用属性中的值，需要这里声明一下，会自动关联起来
            float4 _Color;

            //顶点的Shader，对应图中的2
            v2f vert(appdata v)
            {
                v2f o;
                float4 pos_world = mul(unity_ObjectToWorld, v.vertex);//模型空间转世界空间
                float4 pos_view = mul(UNITY_MATRIX_V, pos_world);//世界空间转相机空间
                float4 pos_clip = mul(UNITY_MATRIX_P, pos_view);//转到裁剪空间
                o.pos = pos_clip;
                return o;
            }
            
            //片元的shader
            float4 frag(v2f i) : SV_Target
            {
                return _Color;
            }
            ENDCG
        }
    }
}
```
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182505.png)
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182508.png)
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182511.png)
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182514.png)
### 纹理
```TypeScript
Shader "TechShader/01MiniShader"
{
    Properties
    {
        //这里属性里面加了一个放贴图用的
        _MainTex("MainTex", 2D) = "black"{}
        _Color("Color", Color) = (0.5,0.5,0.5,0.5)
        
    }
    SubShader
    {
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;//这事第一套UV，UnityShader里面可以写四套
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;//并非UV，这里指的是一个存储器，放东西用的
            };
            float4 _Color;
            //这里要声明一下贴图，产生关联
            sampler2D _MainTex;
            //如果想要修改对应的参数，就需要有对应的_ST声明，这里是贴图的ST
            float4 _MainTex_ST;

            v2f vert(appdata v)
            {
                v2f o;
                //这种方法可以一键转化到裁剪空间
                o.pos = UnityObjectToClipPos(v.vertex);
                //这里是使用_ST，这样才可以在Unity里面修改贴图材质有关的东西
                o.uv = v.uv * _MainTex_ST.xy + _MainTex_ST.zw;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                //返回贴图 颜色采样
                float4 col = tex2D(_MainTex, i.uv);
                return col;
            }
            ENDCG
        }
    }
}
```
tips：代码中有说使用属性中的变量需要在下方声明一次，该变量是有特定的类型的，比如这里上面使用_MainTex，下面使用的是sampler2D，下面给出表格：
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182534.png)
<center>ShaderLab属性类型和CG变量类型的匹配关系</center>

### 剔除效果（偏向功能演示）
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182600.png)
<center>正侧面</center>

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182603.png)<center>后侧面</center>

```TypeScript
//背面剔除的代码
Pass
{
    //这里写上Cull Off，意味着关闭背面剔除效果，默认情况是Cull Back，如果想要开启正面剔除，则是Cull Front
    Cull Off
    CGPROGRAM
    ......
    ENDCG
}
```
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182640.png)在材质窗口去直接修改其Cull属性：
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182645.png)
<center>原本的样子</center>
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182722.png)
<center>直接在材质区修改</center>

```TypeScript
    Properties
    {
        //这里2就是默认使用Back
        [Enum(UnityEngine.Rendering.CullMode)]_CullMode("CullMode", float) = 2
    }
    SubShader
    {
        Pass
        {
            //这里就跟上面对应了
            Cull [_CullMode]
            CGPROGRAM
            ......
            ENDCG
        }
     }
```
在Shader中编写，让材质能够直接选择Cull属性
后面的内容感觉深了点（至少相当于现在的笔者，暂时不加叙述，特指Kerry佬的课）
### Unity的内置文件
在上述代码中有一句：
```TypeScript
#include "UnityCG.cginc"
```
在编写 Shader 时，我们可以使用#include 指令把这些文件包含进来，这样我们就可以使用Unity为我们提供的一些非常有用的变量和帮助函数。
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182749.png)
### Unity语义
==在 DirectX 10 以后，有了一种新的语义类型，就是**系统数值语义（system-value semantics）**。这类语义是以 SV 开头的，SV 代表的含义就是系统数值（system-value）。这些语义在渲染流水线中有特殊的含义。==
==例如在上面的代码中，我们使用 SV_POSITION 语义去修饰顶点着色器的输出变量 pos，那么就表示 pos 包含了可用于光栅化的变换后的顶点坐标（即齐次裁剪空间中的坐标）。用这些语义描述的变量是不可以随便赋值的，因为流水线需要使用它们来完成特定的目的，例如渲染引擎会把用 SV_POSITION 修饰的变量经过光栅化后显示在屏幕上。==
==读者有时可能会看到同一个变量在不同的 Shader 里面使用了不同的语义修饰。例如，一些 Shader 会使用 POSITION 而非 SV_POSITION 来修饰顶点着色器的输出。SV_POSITION 是 DirectX 10 中引入的系统数值语义，在绝大多数平台上，它和 POSITION 语义是等价的，但在某些平台（例如索尼 PS4）上必须使用 SV_POSITION 来修饰顶点着色器的输出，否则无法让 Shader 正常工作。同样的例子还有 COLOR 和 SV_Target。因此，为了让我们的 Shader 有更好的跨平台性，对于这些有特殊含义的变量我们最好使用以 SV 开头的语义进行修饰。==
==——《Unity入门精要》==
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182837.png)
<center>从应用阶段传递模型数据给顶点着色器时Unity支持的常用语义</center>

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182930.png)
<center>从顶点着色器传递数据给片元着色器时Unity使用的常用语义</center>

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260220182932.png)
<center>片元着色器输出时Unity支持的常用语义</center>
