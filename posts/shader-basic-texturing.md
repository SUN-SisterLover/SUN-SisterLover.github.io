---
id: shader-basic-texturing
index: '03'
title_zh: '基本纹理'
title_en: 'Basic Texturing'
excerpt_zh: '纹理的三个典型作用：'
excerpt_en: 'Three typical uses of textures in shaders.'
tags: ['Unity', 'Shader', '渲染', '纹理', '法线贴图']
date: '2025.05.30'
readTime: '9 min'
---

推荐视频：
- 法线贴图讲解（偏向科普类）：https://www.bilibili.com/video/BV1qT411J7p9/
- 百人计划（难度较高，主讲人对这方面比较熟悉，讲的较快，适合有一定基础的看）：https://www.bilibili.com/video/BV1sA411N7z3/

> 本章原作者说明：本章着重讲述纹理采样的原理，因此实现的Shader往往并不能直接应用到实际项目中（直接使用的话会缺少阴影、光照衰减等效果）。我们会在9.5节给出包含了纹理采样和完整光照模型的可真正使用的UnityShader。

纹理的三个典型作用：
1. **表面色**：使用纹理的颜色
2. **弥补图像不足**：使用法线贴图等，扩展图像的应用范围和效果
3. **使用纹理的一些数值**：比如金属度，粗糙度等

# 单张纹理

先贴出来完整的代码，这是Shader入门精要中第七章的内容，以下是一个给纹理的shader（包含了一些基本的光照，缩放等），对应的代码解释，以及一些知识点会在本章的小节中出现。

```hlsl
Shader "TechShader/Chapter 7/Single Texture"
{
    Properties
    {
        _Color("Color Tint", Color) = (1,1,1,1)
        _MainTex("Main Tex", 2D) = "white"{}
        _Specular("Specular", Color) = (1,1,1,1)
        _Gloss("Gloss", Range(8.0, 256)) = 20
    }
    SubShader
    {
        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Lighting.cginc"

            fixed4 _Color;
            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Specular;
            float _Gloss;

            struct a2v
            {
                //顶点位置，法线，纹理坐标
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 texcoord : TEXCOORD0;
            };

            struct v2f
            {
                //顶点位置，法线，世界坐标，纹理坐标
                float4 pos : SV_POSITION;
                float3 worldNormal : TEXCOORD0;
                float3 worldPos : TEXCOORD1;
                float2 uv : TEXCOORD2;
            };

            v2f vert(a2v v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.uv = v.texcoord.xy * _MainTex_ST.xy + _MainTex_ST.zw;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed3 worldNormal = normalize(i.worldNormal);
                fixed3 worldLightDir = normalize(UnityWorldSpaceLightDir(i.worldPos));

                fixed3 albedo = tex2D(_MainTex, i.uv).rgb * _Color.rgb;

                fixed3 ambient = UNITY_LIGHTMODEL_AMBIENT.xyz * albedo;

                fixed3 diffuse = _LightColor0.rgb * albedo * max(0, dot(worldNormal, worldLightDir));

                fixed3 viewDir = normalize(UnityWorldSpaceViewDir(i.worldPos));
                fixed3 halfDir = normalize(worldLightDir + viewDir);
                fixed3 specular = _LightColor0.rgb * _Specular.rgb * pow(max(0, dot(worldNormal, halfDir)), _Gloss);

                return fixed4(ambient + diffuse + specular, 1.0);
            }
            ENDCG
        }
    }
    Fallback "Specular"
}
```

第一部分并未涉及到过多的法线部分，相对来说比较简单，我们分为两部分，第一部分是讲解一点代码，第二部分就是该章节的任务——快速介绍一下材质。

## 代码部分

**顶点着色器：**

```hlsl
v2f vert(a2v v)
{
    v2f o;
    //将顶点位置从物体空间转化到裁剪空间
    o.pos = UnityObjectToClipPos(v.vertex);
    //将法线从物体空间转化到世界空间
    o.worldNormal = UnityObjectToWorldNormal(v.normal);
    //将顶点位置从物体空间转化到世界空间
    o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
    //_MainTex_ST中，xy表示缩放因子，zw表示平移因子
    //将这行代码与顶点的纹理坐标v.texcoord.xy相乘
    //就允许纹理在物体表面进行平移和缩放
    o.uv = v.texcoord.xy * _MainTex_ST.xy + _MainTex_ST.zw;
    return o;
}
```

**片元着色器：**

```hlsl
fixed4 frag(v2f i) : SV_Target
{
    //法线方向获取（归一化，便于光照计算）
    fixed3 worldNormal = normalize(i.worldNormal);
    //获取世界空间中片元位置到光源方向的向量（归一化，便于光照计算）
    fixed3 worldLightDir = normalize(UnityWorldSpaceLightDir(i.worldPos));

    //从纹理中获取颜色
    fixed3 albedo = tex2D(_MainTex, i.uv).rgb * _Color.rgb;

    //刚刚从纹理获取了颜色，将该颜色乘以环境光，获得环境光对片元颜色的贡献
    fixed3 ambient = UNITY_LIGHTMODEL_AMBIENT.xyz * albedo;

    //光强*纹理颜色*余弦角度（一一对应），参考兰伯特定律，得到漫反射光对于片元颜色的贡献
    fixed3 diffuse = _LightColor0.rgb * albedo * max(0, dot(worldNormal, worldLightDir));

    //这里是高光反射的Blinn-Phong光照模型
    //获取世界空间中片元位置到摄像机方向的向量（归一化，便于光照计算）
    fixed3 viewDir = normalize(UnityWorldSpaceViewDir(i.worldPos));
    //获取光源方向和视图方向中间的方向（是镜面反射光的反射方向）
    fixed3 halfDir = normalize(worldLightDir + viewDir);
    //高光反射公式（类似兰伯特，记得还有个pow）
    fixed3 specular = _LightColor0.rgb * _Specular.rgb * pow(max(0, dot(worldNormal, halfDir)), _Gloss);

    return fixed4(ambient + diffuse + specular, 1.0);
}
```

## 纹理属性介绍

### Texture Type（纹理类型）

要为导入的纹理选择合适的纹理类型，这样Unity才能知道我们的意图，从而给Unity Shader传递正确的纹理，并在一些情况下可以让Unity对该纹理进行优化。

![Texture Type 1](images/ComputerScience/计算机图形学/Pasted%20image%20202602200083.png)

![Texture Type 2](images/ComputerScience/计算机图形学/Pasted%20image%20202602200084.png)

### Warp Mode（平铺模式）

决定了纹理坐标超过 $[0,1]$ 范围后如何被平铺，主要有两种模式：

- **Repeat**：如果纹理坐标超过1，那么整数部分将会被舍弃，直接使用小数部分进行采样，效果就是纹理会不断重复
- **Clamp**：如果纹理坐标大于1，就会截取到1，如果小于0，就会截取到0

> 在OpenGL中被称作为Wrapping Model（包装模式），在DirectX中被称作为Texture Addressing Mode（纹理寻址模式）。

![Repeat 模式](images/ComputerScience/计算机图形学/Pasted%20image%20202602200085.png)

<center>Repeat</center>

![Repeat 示例](images/ComputerScience/计算机图形学/Pasted%20image%20202602200086.png)

<center>Clamp</center>

![Clamp 示例](images/ComputerScience/计算机图形学/Pasted%20image%20202602200087.png)

tips：想要让Clamp有这样的效果记得在代码中编写 `_MainTex_ST` 有关的代码。

### Filter Mode（过滤模式）

决定了当纹理由于变换而产生拉伸时将会采取哪种滤波模式，该变换最典型有放大和缩小两种模式。支持三种模式：

![Filter Mode](images/ComputerScience/计算机图形学/Pasted%20image%20202602200088.png)

- **Point**：最近邻采样，效果最差但最快

![Point](images/ComputerScience/计算机图形学/Pasted%20image%20202602200089.png)

- **Bilinear**：双线性插值，中等效果

![Bilinear](images/ComputerScience/计算机图形学/Pasted%20image%20202602200090.png)

- **Trilinear**：三线性插值，效果最好

![Trilinear](images/ComputerScience/计算机图形学/Pasted%20image%20202602200091.png)

![效果对比](images/ComputerScience/计算机图形学/Pasted%20image%20202602200092.png)

效果从左往右变好。

如果将一个64×64的图片纹理贴在一个512×512大小的平面上时，就需要放大纹理。

缩小的过程比放大更加复杂一些，此时原纹理中的多个像素将会对应一个目标像素。因为需要处理抗锯齿问题，最常用的方法是使用**多级渐远纹理（Mip Maps）**技术。该技术将原本的纹理提前用滤波处理来得到很多更小的图像，形成一个图像金字塔，每一层都是对上一层图像降采样的结果。因此，在实际工作的时候，需要多占用约33%的内存空间，这是一种典型的**用空间换取时间**的方法。

> 在纹理导入设置的Advanced选项中勾选 Generate Mip Maps 即可开启该技术。

![Mip Maps 三种模式](images/ComputerScience/计算机图形学/Pasted%20image%20202602200093.png)

<center>三种情况下运用多级渐远纹理的贴图：</center>

![Mip Maps - Point](images/ComputerScience/计算机图形学/Pasted%20image%20202602200094.png)

<center>Point</center>

![Mip Maps - Bilinear](images/ComputerScience/计算机图形学/Pasted%20image%20202602200095.png)

<center>Bilinear</center>

![Mip Maps - Trilinear](images/ComputerScience/计算机图形学/Pasted%20image%20202602200096.png)

<center>Trilinear</center>

# 凹凸映射

纹理另一种常见的应用是凹凸映射，其目的是通过使用一张纹理来修改模型表面的法线，以便为模型提供更多细节，该方法并不会真的改变模型的顶点位置，也不会增加面数，只是单纯的让模型看起来凹凸不平。

- **方法一**：高度映射（高度纹理）
- **方法二**：法线映射（法线纹理）

## 高度纹理

使用一张高度图来实现凹凸映射，高度图中存储的是强度值，用于表示模型表面局部的海拔高度。因此颜色越浅表示该位置越向外凸起，颜色越深表示该位置越向里凹陷。

这种方法的好处是非常直观，我们可以从高度图明确地知道一个模型表面的凹凸状况，但是缺点是比较复杂，在实时计算时无法直接得到表面法线，需要从像素的灰度值计算而得，因此需要消耗更多的性能。

![高度图](images/ComputerScience/计算机图形学/Pasted%20image%20202602200097.png)

## 法线纹理

法线纹理中存储的就是表面的法线方向。由于法线方向的分量范围在 $[-1,1]$，而像素的分量范围在 $[0,1]$，因此我们会使用一个映射：

$$\text{像素分量} = \frac{\text{法线分量} + 1}{2}$$

**法线的方向到底朝哪？** 方向一定是相对于坐标空间说的。对于模型顶点自带的法线，它们是定义在模型空间中的，因此一种直接的想法就是将修改后的模型空间中的表面法线存储在一张纹理中，这种纹理被称作是**模型空间的法线纹理**。

实际上，我们会采取另外一种坐标空间，即模型顶点的**切线空间**来存储法线。对于模型的每个顶点，都有一个属于自己的切线空间，该切线的原点就是顶点本身，z轴是顶点的法线方向，x轴是顶点的切线方向，y轴由二者叉积而得。

![模型顶点的切线空间](images/ComputerScience/计算机图形学/Pasted%20image%20202602200098.png)

<center>模型顶点的切线空间</center>

![模型空间 vs 切线空间法线纹理](images/ComputerScience/计算机图形学/Pasted%20image%20202602200099.png)

<center>模型空间下的法线纹理 VS 切线空间下的法线纹理</center>

### 模型空间法线纹理 vs 切线空间法线纹理

模型空间下的法线纹理更符合人类的直观认识，而且法线纹理本身也很直观，容易调整，但是实际更偏好使用切线空间，原因如下：

1. **自由度很高**：模型空间下的法线纹理记录的是绝对法线信息，仅可用于创建它时的那个模型，而应用到其他模型上效果就完全错误了。而切线空间下的法线纹理记录的是相对法线信息。

2. **可进行UV动画**：我们可以移动一个纹理的UV坐标来实现一个凹凸移动的效果，但使用模型空间下的法线纹理会得到完全错误的结果。

3. **可以重用法线纹理**：比如一个砖块，我们仅使用一张法线纹理就可以用到所有的6个面上。

4. **可压缩**：切线空间下的法线纹理中法线的Z方向总是正方向，因此我们可以仅存储XY方向，而推导得到Z方向。而模型空间下的法线纹理由于每个方向都是可能的，因此必须存储3个方向的值，不可压缩。

## 代码实践

因此我们通常有两种选择：
- **在切线空间下进行光照计算**：此时我们需要把光照方向、视角方向变换到切线空间下
- **在世界空间下进行光照计算**：此时我们需要把采样得到的法线方向变换到世界空间下

> 从效率上来说，第一种方法往往要优于第二种方法，因为我们可以在顶点着色器中就完成对光照方向和视角方向的变换。但从通用性角度来说，第二种方法要优于第一种方法，因为有时我们需要在世界空间下进行一些计算（例如使用Cubemap进行环境映射时）。

### 在切线空间下计算

基本思路是：在片元着色器中通过纹理采样得到切线空间下的法线，然后再与切线空间下的视角方向、光照方向等进行计算，得到最终的光照结果。

```hlsl
Shader "TechShader/NormalMapTangentSpace"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _MainTex ("Main Tex", 2D) = "white" {}
        //法线纹理
        _BumpMap ("Normal Map", 2D) = "bump"{}
        //控制法线深度
        _BumpScale ("Bump Scale", Float) = 1.0
        //高光颜色
        _Specular ("Specular", Color) = (1,1,1,1)
        //高光强度
        _Gloss ("Gloss", Range(8.0, 256)) = 20
    }
    SubShader
    {
        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Lighting.cginc"

            fixed4 _Color;
            sampler2D _MainTex;
            //纹理缩放
            float4 _MainTex_ST;
            sampler2D _BumpMap;
            //法线纹理缩放
            float4 _BumpMap_ST;
            float _BumpScale;
            fixed4 _Specular;
            float _Gloss;

            struct a2v
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                //TANGENT语义来描述float4的tangent变量，为顶点的切线方向服务
                float4 tangent : TANGENT;
                float4 texcoord : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 uv : TEXCOORD0;
                //由于我们需要在顶点着色器中计算切线空间下的光照和视角方向
                //这里添加两个变量存储变换后的光照和视角方向
                float3 lightDir : TEXCOORD1;
                float3 viewDir : TEXCOORD2;
            };

            v2f vert (a2v v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);

                o.uv.xy = v.texcoord.xy * _MainTex_ST.xy + _MainTex_ST.zw;
                o.uv.zw = v.texcoord.xy * _BumpMap_ST.xy + _BumpMap_ST.zw;

                //定义好的宏，用来将世界空间/模型空间中的光照方向，视角方向转换到切线空间
                //得到一个rotation变换矩阵
                TANGENT_SPACE_ROTATION;
                //ObjSpaceLightDir和ObjSpaceViewDir用来得到模型空间下的光照和视角方向
                o.lightDir = mul(rotation, ObjSpaceLightDir(v.vertex)).xyz;
                o.viewDir = mul(rotation, ObjSpaceViewDir(v.vertex)).xyz;

                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                //用于存储切线空间的光照和视角方向
                fixed3 tangentLightDir = normalize(i.lightDir);
                fixed3 tangentViewDir = normalize(i.viewDir);

                fixed4 packedNormal = tex2D(_BumpMap, i.uv.zw);
                fixed3 tangentNormal;
                //UnpackNormal将压缩的法线数据转化为标准的法线向量
                tangentNormal = UnpackNormal(packedNormal);
                //通过该属性调整法线的xy分量，从而控制法线贴图的深度效果
                tangentNormal.xy *= _BumpScale;
                //重新计算法线的z分量，确保法线向量长度为1
                tangentNormal.z = sqrt(1.0 - saturate(dot(tangentNormal.xy, tangentNormal.xy)));

                //从主纹理采样，与Color相乘得到物体颜色
                fixed3 albedo = tex2D(_MainTex, i.uv).rgb * _Color.rgb;

                //计算环境光对物体颜色的影响
                fixed3 ambient = UNITY_LIGHTMODEL_AMBIENT.xyz * albedo;

                //计算漫反射光照
                fixed3 diffuse = _LightColor0.rgb * albedo * max(0.0, dot(tangentNormal, tangentLightDir));

                //计算高光反射
                fixed3 halfDir = normalize(tangentLightDir + tangentViewDir);
                fixed3 specular = _LightColor0.rgb * _Specular.rgb * pow(max(0.0, dot(tangentNormal, halfDir)), _Gloss);

                return fixed4(ambient + diffuse + specular, 1.0);
            }
            ENDCG
        }
    }
    Fallback "Specular"
}
```

![切线空间法线贴图效果](images/ComputerScience/计算机图形学/Pasted%20image%20202602200100.png)

### 在世界空间下计算

在顶点着色器中计算从切线空间到世界空间的变换矩阵，并把它传递给片元着色器。变换矩阵的计算可以由顶点的切线、副切线和法线在世界空间下的表示来得到。最后，我们只需要在片元着色器中把法线纹理中的法线方向从切线空间变换到世界空间下即可。

```hlsl
Shader "TechShader/Normal Map In World Space"
{
    Properties
    {
        _Color ("Color Tint", Color) = (1, 1, 1, 1)
        _MainTex ("Main Tex", 2D) = "white" {}
        _BumpMap ("Normal Map", 2D) = "bump" {}
        _BumpScale ("Bump Scale", Float) = 1.0
        _Specular ("Specular", Color) = (1, 1, 1, 1)
        _Gloss ("Gloss", Range(8.0, 256)) = 20
    }
    SubShader
    {
        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Lighting.cginc"

            fixed4 _Color;
            sampler2D _MainTex;
            float4 _MainTex_ST;
            sampler2D _BumpMap;
            float4 _BumpMap_ST;
            float _BumpScale;
            fixed4 _Specular;
            float _Gloss;

            struct a2v
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 tangent : TANGENT;
                float4 texcoord : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 uv : TEXCOORD0;
                //使用一个3x3的矩阵，这里用三个插值寄存器（float3x3，但是这里是float4）
                //为了充分利用插值寄存器的存储空间，我们将世界空间下的顶点位置存储在这些变量的w分量中
                float4 TtoW0 : TEXCOORD1;
                float4 TtoW1 : TEXCOORD2;
                float4 TtoW2 : TEXCOORD3;
            };

            v2f vert(a2v v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);

                o.uv.xy = v.texcoord.xy * _MainTex_ST.xy + _MainTex_ST.zw;
                o.uv.zw = v.texcoord.xy * _BumpMap_ST.xy + _BumpMap_ST.zw;

                //获得变换矩阵的参数
                float3 worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                fixed3 worldNormal = UnityObjectToWorldNormal(v.normal);
                fixed3 worldTangent = UnityObjectToWorldDir(v.tangent.xyz);
                fixed3 worldBinormal = cross(worldNormal, worldTangent) * v.tangent.w;

                //将参数存入TtoW中
                o.TtoW0 = float4(worldTangent.x, worldBinormal.x, worldNormal.x, worldPos.x);
                o.TtoW1 = float4(worldTangent.y, worldBinormal.y, worldNormal.y, worldPos.y);
                o.TtoW2 = float4(worldTangent.z, worldBinormal.z, worldNormal.z, worldPos.z);

                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                //构建世界空间下的坐标，并得到世界空间下的光照和视角方向
                float3 worldPos = float3(i.TtoW0.w, i.TtoW1.w, i.TtoW2.w);
                fixed3 lightDir = normalize(UnityWorldSpaceLightDir(worldPos));
                fixed3 viewDir = normalize(UnityWorldSpaceViewDir(worldPos));

                fixed3 bump = UnpackNormal(tex2D(_BumpMap, i.uv.zw));
                bump.xy *= _BumpScale;
                bump.z = sqrt(1.0 - saturate(dot(bump.xy, bump.xy)));
                bump = normalize(half3(dot(i.TtoW0.xyz, bump), dot(i.TtoW1.xyz, bump), dot(i.TtoW2.xyz, bump)));

                fixed3 albedo = tex2D(_MainTex, i.uv).rgb * _Color.rgb;
                fixed3 ambient = UNITY_LIGHTMODEL_AMBIENT.xyz * albedo;
                fixed3 diffuse = _LightColor0.rgb * albedo * max(0, dot(bump, lightDir));

                fixed3 halfDir = normalize(lightDir + viewDir);
                fixed3 specular = _LightColor0.rgb * _Specular.rgb * pow(max(0, dot(bump, halfDir)), _Gloss);

                return fixed4(ambient + diffuse + specular, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Specular"
}
```

> 笔者个人留存：这里推导出对应的转换坐标以及存储在TtoW的这一步，后面得重新推导一下，数学理论这里得搞清楚才是，之前推导的时候没有认真推，应该更仔细观察一下矩阵性质才对喵。

### UnpackNormal函数

上文我们提到了一个函数 `UnpackNormal`，可以用它来得到正确的法线方向，但是我们需要将法线纹理类型标识为 **Normal map**。

![Normal map 设置](images/ComputerScience/计算机图形学/Pasted%20image%20202602200101.png)

选择 Normal map 后，可以有复选框 **Create from Grayscale**，这个是用来从高度图中生成法线纹理的。

勾选 Create from Grayscale 后，多出来两个选项：
- **Bumpiness**：用来控制凹凸程度
- **Filtering**：决定用哪种方式来计算凹凸程度。一种是 Smooth（比较平滑），一种是 Sharp（使用Sobel滤波）

# 渐变纹理

```hlsl
Shader "TechShader/Ramp Texture"
{
    Properties
    {
        _Color ("Color Tint", Color) = (1, 1, 1, 1)
        //用来存储渐变纹理
        _RampTex ("Ramp Tex", 2D) = "white" {}
        _Specular ("Specular", Color) = (1, 1, 1, 1)
        _Gloss ("Gloss", Range(8.0, 256)) = 20
    }
    SubShader
    {
        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Lighting.cginc"

            fixed4 _Color;
            sampler2D _RampTex;
            //渐变纹理的纹理属性变量
            float4 _RampTex_ST;
            fixed4 _Specular;
            float _Gloss;

            struct a2v
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 texcoord : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldNormal : TEXCOORD0;
                float3 worldPos : TEXCOORD1;
                float2 uv : TEXCOORD2;
            };

            v2f vert(a2v v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                //使用了内置的TRANSFORM_TEX宏计算经过平铺和偏移后的纹理坐标
                o.uv = TRANSFORM_TEX(v.texcoord, _RampTex);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed3 worldNormal = normalize(i.worldNormal);
                fixed3 worldLightDir = normalize(UnityWorldSpaceLightDir(i.worldPos));

                fixed3 ambient = UNITY_LIGHTMODEL_AMBIENT.xyz;

                //使用了半兰伯特模型
                fixed halfLambert  = 0.5 * dot(worldNormal, worldLightDir) + 0.5;
                //从渐变纹理中采样
                fixed3 diffuseColor = tex2D(_RampTex, fixed2(halfLambert, halfLambert)).rgb * _Color.rgb;

                fixed3 diffuse = _LightColor0.rgb * diffuseColor;

                fixed3 viewDir = normalize(UnityWorldSpaceViewDir(i.worldPos));
                fixed3 halfDir = normalize(worldLightDir + viewDir);
                fixed3 specular = _LightColor0.rgb * _Specular.rgb * pow(max(0, dot(worldNormal, halfDir)), _Gloss);

                return fixed4(ambient + diffuse + specular, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Specular"
}
```

渐变纹理的核心思路：将**半兰伯特**漫反射系数（0~1范围）作为UV坐标去采样一张渐变图，从而实现对漫反射的"艺术化"控制。

![渐变纹理效果1](images/ComputerScience/计算机图形学/Pasted%20image%20202602200102.png)

![渐变纹理效果2](images/ComputerScience/计算机图形学/Pasted%20image%20202602200103.png)

# 遮罩纹理

```hlsl
Shader "TechShader/Mask Texture"
{
    Properties
    {
        _Color ("Color Tint", Color) = (1, 1, 1, 1)
        _MainTex ("Main Tex", 2D) = "white" {}
        _BumpMap ("Normal Map", 2D) = "bump" {}
        _BumpScale("Bump Scale", Float) = 1.0
        //声明更多的变量来控制高光反射
        //_SpecularMask是高光反射遮罩纹理
        //_SpecularScale是控制遮罩影响度的系数
        _SpecularMask ("Specular Mask", 2D) = "white" {}
        _SpecularScale ("Specular Scale", Float) = 1.0
        _Specular ("Specular", Color) = (1, 1, 1, 1)
        _Gloss ("Gloss", Range(8.0, 256)) = 20
    }
    SubShader
    {
        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Lighting.cginc"

            fixed4 _Color;
            sampler2D _MainTex;
            float4 _MainTex_ST;
            sampler2D _BumpMap;
            float _BumpScale;
            sampler2D _SpecularMask;
            float _SpecularScale;
            fixed4 _Specular;
            float _Gloss;

            struct a2v
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 tangent : TANGENT;
                float4 texcoord : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 lightDir: TEXCOORD1;
                float3 viewDir : TEXCOORD2;
            };

            v2f vert(a2v v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv.xy = v.texcoord.xy * _MainTex_ST.xy + _MainTex_ST.zw;

                TANGENT_SPACE_ROTATION;
                o.lightDir = mul(rotation, ObjSpaceLightDir(v.vertex)).xyz;
                o.viewDir = mul(rotation, ObjSpaceViewDir(v.vertex)).xyz;

                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed3 tangentLightDir = normalize(i.lightDir);
                fixed3 tangentViewDir = normalize(i.viewDir);

                fixed3 tangentNormal = UnpackNormal(tex2D(_BumpMap, i.uv));
                tangentNormal.xy *= _BumpScale;
                tangentNormal.z = sqrt(1.0 - saturate(dot(tangentNormal.xy, tangentNormal.xy)));

                fixed3 albedo = tex2D(_MainTex, i.uv).rgb * _Color.rgb;

                fixed3 ambient = UNITY_LIGHTMODEL_AMBIENT.xyz * albedo;

                fixed3 diffuse = _LightColor0.rgb * albedo * max(0, dot(tangentNormal, tangentLightDir));

                //计算高光反射的时候增加了有关于遮罩相关的变量
                fixed3 halfDir = normalize(tangentLightDir + tangentViewDir);
                fixed specularMask = tex2D(_SpecularMask, i.uv).r * _SpecularScale;
                fixed3 specular = _LightColor0.rgb * _Specular.rgb * pow(max(0, dot(tangentNormal, halfDir)), _Gloss) * specularMask;

                return fixed4(ambient + diffuse + specular, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Specular"
}
```

遮罩纹理的核心思路：用一张额外的贴图控制高光反射在各个片元上的**强度**，遮罩纹理的R通道（或任意通道）的值乘以原来的高光结果，来达到局部抑制高光的效果。

![遮罩纹理效果](images/ComputerScience/计算机图形学/Pasted%20image%20202602200104.png)

# 透明效果

（此章节暂无内容，待后续补充）
