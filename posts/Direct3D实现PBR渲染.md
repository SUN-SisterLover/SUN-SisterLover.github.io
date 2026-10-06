---
id: direct3d-pbr-rendering
index: '15'
title_zh: 'Direct3D实现PBR渲染'
excerpt_zh: 'PBR可以让渲染的精度更高，使画面更加好看。有些简单的游戏中的颜色RGB，因为精度问题，一般都是8位，而PBR则是升级到了32位，从而使精度更高，这样就不用考虑'
tags: ['Direct3D', '渲染', '项目', 'PBR', '计算机图形学', '技术美术']
date: '2026.03.02'
readTime: '8 min'
---

# PBR介绍

PBR可以让渲染的精度更高，使画面更加好看。有些简单的游戏中的颜色RGB，因为精度问题，一般都是8位，而PBR则是升级到了32位，从而使精度更高，这样就不用考虑因为精度问题导致曝光出了问题。

而这类渲染方式统称为HDR渲染。实现HDR要先创建一个FBO，他的数据精度会比普通的要高，还要做一个ToneMapping，用来将其转换为SDR（以后再补）

## 创建项目
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260302200532.png)
清空项目中不需要的附加文件（只保留Codes.sln、Codes.vcxproj、Codes.vcxproj.filtes、Codes.vcxproj.user），导入FrameWork后（本课程只考虑PBR的实现，FrameWork后续在对其进行研究），即可开始，随后配置基本的渲染环境：
**Scene.h**
```C++
#pragma once
void InitScene(int intWidth, int inHeight);
void RenderOneFrame(float inDeltaTime);
```
**Scene.cpp**
```C++
#include "Scene.h"
#include "BattleFireDirect3D12.h"

void InitScene(int inWidth, int inHeight)
{

}

void RenderOneFrame(float inDeltaTime)
{
	RHICommandList rhiCommandList;
	FrameBufferRT* rt = BeginRenderFrame(rhiCommandList.mCommandList);

	EndRenderFrame(rhiCommandList.mCommandList);

}
```
 **代码拆解：**
 `InitScene(int inWidth, int inHeight)`：是一个初始化占位符。在 DirectX 开发中，在这里创建与窗口大小相关的资源。
 
 `RenderOneFrame(float inDeltaTime)`：是渲染的核心逻辑，每一帧都会被调用（例如每秒 60 次）。
 
 `RHICommandList`：对`ID3D12GraphicsCommandList`的封装。构造函数会自动调用 `GetCommandList()`内部执行了 `Reset`），而析构函数则自动调用 `EndCommandList(1)`（内部执行了 `Close` 和 `Execute`）。原生的`ID3D12GraphicsCommandList`每一帧都必须要先Reset才能开始录制，必须先CLose才能提交，提交后必须处理同步。
```C++
 struct RHICommandList {
	ID3D12GraphicsCommandList* mCommandList;
	RHICommandList();
	~RHICommandList();
	ID3D12GraphicsCommandList* operator->() {
		return mCommandList;
	}
};
RHICommandList::RHICommandList() {
	mCommandList = GetCommandList();
}
RHICommandList::~RHICommandList() {
	EndCommandList(1);
}
```
 
**运行后结果：**
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260303065050.png)
# 搭建HDR渲染管线

在显示器（LDR，低动态范围）的世界里，颜色值只能是 $0.0$（纯黑）到 $1.0$（纯白）。

在物理世界中，光照强度是没有上限的（太阳的亮度远高于白纸）。传统的 8 位颜色空间（0-255）无法表现这种跨度。因此，我们需要一个“高动态范围”的缓冲区来存储计算结果，最后再通过 **Tone Mapping（色调映射）** 压缩回显示器能显示的范围。

**HDR 渲染管线必须具备的两个要素：**

1. **高精度缓冲区（Floating Point Buffer）：** 能够存储大于 $1.0$ 数值的“容器”。
    
2. **色调映射（Tone Mapping）：** 在最后一步，把这些巨大的数值智能地压缩回 $[0.0, 1.0]$，让显示器能正常显示。

**Scene.cpp**
```C++
#include "Scene.h"
#include "BattleFireDirect3D12.h"
#include "FrameBuffer.h"

FrameBuffer* gHDRFBO = nullptr;

void InitScene(int inWidth, int inHeight)
{
	gHDRFBO = new FrameBuffer;
	gHDRFBO->SetSize(inWidth, inHeight);
	gHDRFBO->AttachColorBuffer(DXGI_FORMAT_R32G32B32A32_FLOAT);
	gHDRFBO->AttachDepthBuffer();
}

void RenderOneFrame(float inDeltaTime)
{
	//ldr
	RHICommandList rhiCommandList;
	//draw skybox
	//draw material sphere
	FrameBufferRT* rt = gHDRFBO->BeginRendering(rhiCommandList.mCommandList);
	delete rt;
	rt = BeginRenderFrame(rhiCommandList.mCommandList);
	//tone mapping, hdr -> swapchain
	EndRenderFrame(rhiCommandList.mCommandList);
	delete rt;
}
```
 **代码拆解：**
 在`InitScene`中新建了一个HDR的FBO（帧缓冲对象），相当于一个离线的画布，我们将在FBO中做好所有的设置之后再将其渲染。绑定画布的尺寸、在显存中开辟一块空间并且使用R32G32B32A32_FLOAT，并且给予其深度支持。
 
 `FrameBufferRT* rt = gHDRFBO->BeginRendering(rhiCommandList.mCommandList);`：将画布绑定在当前的HDR上。
```C++
 struct FrameBufferRT {
	Texture mColorBuffer;
	Texture mDSBuffer;
};
```
该结构体把当前那一帧**正在被使用**的资源（Resource）及其对应的描述符（RTV/DSV）打包在一起。这样，只需要通过这个 `rt` 指针，就能立刻获取到 GPU 绘图所需要的东西。
本部分源码量过多，直接放在程序中进行注释讲解！
```C++
FrameBufferRT* FrameBuffer::BeginRendering(ID3D12GraphicsCommandList* inCommandList/* =nullptr */) {
	// GPU是高度并行的，在上一帧，HDR 纹理可能作为只读贴图被采样。现在要往里写东西，必须告诉其暂停，并且把这块内存从读状态切换到写状态。
	D3D12_RESOURCE_BARRIER berrierCRT = InitResourceBarrier(mColorBuffer, D3D12_RESOURCE_STATE_GENERIC_READ, D3D12_RESOURCE_STATE_RENDER_TARGET);
	inCommandList->ResourceBarrier(1, &berrierCRT);
	D3D12_RESOURCE_BARRIER berrierDSRT = InitResourceBarrier(mDSBuffer, D3D12_RESOURCE_STATE_GENERIC_READ, D3D12_RESOURCE_STATE_DEPTH_WRITE);
	inCommandList->ResourceBarrier(1, &berrierDSRT);
	FrameBufferRT* frameBufferRT = new FrameBufferRT;
	frameBufferRT->mColorBuffer.mDescriptorHeap = mRTVDescriptorHeap;
	frameBufferRT->mColorBuffer.mFormat = mFormat;
	frameBufferRT->mColorBuffer.mResource = mColorBuffer;
	frameBufferRT->mColorBuffer.mRTV = mRTVDescriptorHeap->GetCPUDescriptorHandleForHeapStart();
	frameBufferRT->mDSBuffer.mDescriptorHeap = mDSVDescriptorHeap;
	frameBufferRT->mDSBuffer.mFormat = DXGI_FORMAT_R24G8_TYPELESS;
	frameBufferRT->mDSBuffer.mResource = mDSBuffer;
	frameBufferRT->mDSBuffer.mRTV = mDSVDescriptorHeap->GetCPUDescriptorHandleForHeapStart();
	// OM，这是渲染管线的最后一步，进行测试混合之类的
	inCommandList->OMSetRenderTargets(1, &frameBufferRT->mColorBuffer.mRTV, FALSE, &frameBufferRT->mDSBuffer.mRTV);
	// 定义一套缩放比例，用于投影渲染，以及裁剪等
	D3D12_VIEWPORT viewport = { 0.0f,0.0f,float(mWidth),float(mHeight),0.0f,1.0f };
	D3D12_RECT scissorRect = { 0,0,mWidth,mHeight };
	inCommandList->RSSetViewports(1, &viewport);
	inCommandList->RSSetScissorRects(1, &scissorRect);
	// 清理显存
	const float hdrClearColor[] = { 0.0f, 0.0f, 0.0f, 0.0f };
	inCommandList->ClearRenderTargetView(frameBufferRT->mColorBuffer.mRTV, hdrClearColor, 0, nullptr);
	inCommandList->ClearDepthStencilView(frameBufferRT->mDSBuffer.mRTV, D3D12_CLEAR_FLAG_DEPTH | D3D12_CLEAR_FLAG_STENCIL, 1.0f, 0, 0, nullptr);
	return frameBufferRT;
}
```


`rt = BeginRenderFrame(rhiCommandList.mCommandList);`：HDR渲染管线的最终出口的准备，用来在电脑屏幕（LDR交换链）进行绘画。
本部分源码量过多，直接放在程序中进行注释讲解！
```C++
FrameBufferRT* BeginRenderFrame(ID3D12GraphicsCommandList* inCommandList) {
	// 切换状态：把屏幕缓冲（sRenderTargets）从“显示状态”变成“可写状态”
	D3D12_RESOURCE_BARRIER barrier0 = InitResourceBarrier(sRenderTargets[sCurrentFrameIndex], D3D12_RESOURCE_STATE_PRESENT, D3D12_RESOURCE_STATE_RENDER_TARGET);
	inCommandList->ResourceBarrier(1, &barrier0);
	FrameBufferRT* frameBuffer = new FrameBufferRT;
	frameBuffer->mColorBuffer.mDescriptorHeap = sRTVDescriptorHeap;
	// 算地址：屏幕往往有2张图（前台/后台），根据 sCurrentFrameIndex 算出此时该画哪一张。这就是为什么它有一行复杂的加法偏移计算，而 HDR FBO 不需要
	frameBuffer->mColorBuffer.mRTV.ptr = frameBuffer->mColorBuffer.mDescriptorHeap->GetCPUDescriptorHandleForHeapStart().ptr + sCurrentFrameIndex * GetDirect3DDevice()->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_RTV);
	// 定格式：这里的格式是 sColorRTFormat (通常是 R8G8B8A8)，也就是普通屏幕格式
	frameBuffer->mColorBuffer.mFormat = sColorRTFormat;
	frameBuffer->mDSBuffer.mDescriptorHeap = sDSDescriptorHeap;
	frameBuffer->mDSBuffer.mRTV = frameBuffer->mDSBuffer.mDescriptorHeap->GetCPUDescriptorHandleForHeapStart();
	frameBuffer->mDSBuffer.mFormat = sDSRTFormat;
	// 挂载：告诉 GPU，现在的输出口是【屏幕】
	inCommandList->OMSetRenderTargets(1, &frameBuffer->mColorBuffer.mRTV, FALSE, &frameBuffer->mDSBuffer.mRTV);
	D3D12_VIEWPORT viewport = { 0.0f,0.0f,float(sViewportWidth),float(sViewportHeight),0.0f,1.0f };
	D3D12_RECT scissorRect = { 0,0,sViewportWidth,sViewportHeight };
	inCommandList->RSSetViewports(1, &viewport);
	inCommandList->RSSetScissorRects(1, &scissorRect);
	const float clearColor[] = { 0.1f, 0.4f, 0.6f, 1.0f };
	// 刷色：这里把屏幕刷成了“天蓝色” { 0.1f, 0.4f, 0.6f, 1.0f }
	inCommandList->ClearRenderTargetView(frameBuffer->mColorBuffer.mRTV, clearColor, 0, nullptr);
	inCommandList->ClearDepthStencilView(frameBuffer->mDSBuffer.mRTV, D3D12_CLEAR_FLAG_DEPTH | D3D12_CLEAR_FLAG_STENCIL, 1.0f, 0, 0, nullptr);
	return frameBuffer;
}
```

`EndRenderFrame(rhiCommandList.mCommandList);`：同一块显存在不同的时刻不一样，**渲染时**：它的状态必须是 `RENDER_TARGET`（渲染目标），**显示时**：它的状态必须是 `PRESENT`（展示）。这行代码本质上是在给 GPU 发送一条**同步指令**，告诉GPU针对这张图的写操作必须在这里全部结束，如果没有该指令就可能导致显示器只拿到一部分像素，从而产生画面撕裂。
```C++
void EndRenderFrame(ID3D12GraphicsCommandList* inCmdList) {
	D3D12_RESOURCE_BARRIER frameEndBerrier = InitResourceBarrier(sRenderTargets[sCurrentFrameIndex], D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_PRESENT);
	inCmdList->ResourceBarrier(1, &frameEndBerrier);
}
```

# PBR算法框架搭建
本部分搭建一个用于编写PBR的基本算法框架，并没有写具体的渲染公式，只是框架。
创建两个hlsl文件（一个也可以，主要看怎么去写）
**pbr_vs.hlsl**：顶点着色器(Vertex Shader - 几何阶段)
```hlsl
struct VertexData{
    float4 position:POSITION;
    float4 texcoord:TEXCOORD0;
    float4 normal:NORMAL;
};

struct VertexOutput{
    float4 position:SV_POSITION;
    float4 texcoord:TEXCOORD0;
    float4 normal:NORMAL;
    float4 positionWS:TEXCOORD1;
};

cbuffer X:register(b0){
    float4x4 ProjectionMatrix;
    float4x4 ViewMatrix;
    float4x4 ModelMatrix;
    float4x4 ITModelMatrix;
    float4x4 Reserverd[1020];
};

VertexOutput main(VertexData inVertexData){
    VertexOutput o;
    float4 positionWS=mul(ModelMatrix, float4(inVertexData.position.xyz,1.0f));
    float4 positionVS=mul(ViewMatrix,positionWS);
    float4 positionCS=mul(ProjectionMatrix,positionVS);
    float3 normalWS=mul(ITModelMatrix,float4(inVertexData.normal.xyz,0.0f));
    o.position=positionCS;
    o.texcoord=inVertexData.texcoord;
    o.normal=float4(normalWS,0.0f);
    o.positionWS=positionWS;
    return o;
}
```
`VertexData`：分别是原始坐标（模型空间），纹理坐标（UV），原始法线（模型空间）。
`VertexOutput`：顶点着色器VS和像素着色器PS的通讯，定义了GPU处理完几何体之后哪些数据需要被处理为片元着色。这里的参数分别是裁剪空间坐标，纹理坐标UV，世界空间法线，世界空间坐标。
`cbuffer X`：常量缓冲区，对应参数分别为模型矩阵，观察矩阵，投影矩阵，法线变换矩阵，预留填充。
`main`：核心逻辑。
**pbr_ps.hlsl**：片元/像素着色器(Pixel Shader - 光栅化阶段)
```hlsl
struct PSInput{
    float4 position:SV_POSITION;
    float4 texcoord:TEXCOORD0;
    float4 normal:NORMAL;
    float4 positionWS:TEXCOORD1;
};
float4 main(PSInput inPSInput):SV_TARGET{
    float3 finalColor=float3(0.0f,0.0f,0.0f);
    float3 ambientColor=float3(0.0f,0.0f,0.0f);
    float3 diffuseColor=float3(0.0f,0.0f,0.0f);
    float3 specularColor=float3(0.0f,0.0f,0.0f);
    finalColor=ambientColor+diffuseColor+specularColor;
    return float4(finalColor,1.0f);
}
```
基本的环境光，漫反射和镜面高光。


# 编写材质球有关的代码搭建
更新后的**Scene.cpp**如下：
```C++
#include "Scene.h"
#include "BattleFireDirect3D12.h"
#include "FrameBuffer.h"
#include "Node.h"
#include "Camera.h"
#include "Material.h"

FrameBuffer* gHDRFBO = nullptr;
Node* gNode = nullptr;
DirectX::XMMATRIX gProjectionMatrix;
Camera gMainCamera;

void InitSphere(ID3D12GraphicsCommandList* inCommandList) {
	gNode = new Node;
	StaticMeshComponent* staticMesh = new StaticMeshComponent;
	staticMesh->InitFromFile(inCommandList, "Res/Model/Sphere.staticmesh");
	gNode->mStaticMeshComponent = staticMesh;
	Material* material = new Material(L"Res/pbr_vs.hlsl", L"Res/pbr_ps.hlsl");
	material->SetCullMode(D3D12_CULL_MODE_FRONT);
	gNode->mStaticMeshComponent = staticMesh;
	gNode->mStaticMeshComponent->mMaterial = material;
}

void InitScene(int inWidth, int inHeight)
{
	gProjectionMatrix = DirectX::XMMatrixPerspectiveFovLH(
		(45.0f * 3.14f) / 180.0f, float(inWidth) / float(inHeight),
		0.1f, 1000.0f
	);
	gMainCamera.Init(DirectX::XMVectorSet(0.0f, 0.0f, 0.0f, 1.0f),
		5.0f, DirectX::XMVectorSet(0.0f,-0.2f,1.0f,0.0f));
	gHDRFBO = new FrameBuffer;
	gHDRFBO->SetSize(inWidth, inHeight);
	gHDRFBO->AttachColorBuffer(DXGI_FORMAT_R32G32B32A32_FLOAT);
	gHDRFBO->AttachDepthBuffer();
	RHICommandList rhiCommandList;
	InitSphere(rhiCommandList.mCommandList);
}

void RenderOneFrame(float inDeltaTime)
{
	//ldr
	RHICommandList rhiCommandList;
	//draw skybox
	//draw material sphere
	FrameBufferRT* rt = gHDRFBO->BeginRendering(rhiCommandList.mCommandList);
	gNode->Draw(rhiCommandList.mCommandList, gProjectionMatrix, gMainCamera, rt->mColorBuffer.mFormat, rt->mDSBuffer.mFormat);
	gHDRFBO->EndRendering(rhiCommandList.mCommandList);
	delete rt;
	rt = BeginRenderFrame(rhiCommandList.mCommandList);
	//tone mapping, hdr -> swapchain
	EndRenderFrame(rhiCommandList.mCommandList);
	delete rt;
}
```

# 关于调试
在项目属性，生成后事件中编写以下内容：
```
editbin/subsystem:console $(OutDir)$(ProjectName).exe
```

下面再补充一些东西：

# 光照思路

对一个像素（一个表面点），最终颜色一般由这几类光贡献叠加：

- 直接光（Direct）：光源直接照到该点，再到相机（你这里是一个写死的方向光 `L`，没有阴影）
- 间接光（Indirect）：光源照到环境/其它物体反弹后，再照到该点（你这里用 IBL 来近似）
- 环境遮蔽 AO（Ambient Occlusion）：让“缝隙里更暗、外面更亮”
- 自发光 Emissive：物体自己发光，不依赖光照

所以可以把渲染逻辑概括为：

**最终颜色 = Direct(漫反射+镜面) + IBL(漫反射+镜面) × AO + Emissive**



# Scene

`Scene.cpp` 其实就是我这套 PBR Demo 的场景调度中心：  
负责初始化投影矩阵和相机，构建三个关键节点——PBR 模型节点、天空盒节点、Tone Mapping 节点，再在每一帧里按照顺序：
在 HDR 帧缓冲中先画天空盒和 PBR 模型；
再用全屏四边形做 Tone Mapping，把 HDR 结果压缩成 LDR 输出到屏幕。

```cpp
void InitScene(int inWidth, int inHeight)
```
- 搭建相机，投影矩阵
- 创建 HDR 离屏 FBO
- 生成IBL资源
- 创建三个渲染对象`InitSphere()`，`InitSkyBox()`，`InitToneMapping()`

**RHICommanndList**：调用类似`LoadHDRICubeMapFromFile(rhiCommandList.mCommandList, ...)`的语句时，会把 IBL 的多个离线渲染步骤（写到不同贴图）都录到同一个 command list 里，最后一次性提交给 GPU 执行。

**IBL预计算**：IBL 的目标是：用环境贴图模拟“间接光/环境反射”，并让每一帧运行计算尽量简单。
- 把 HDRI 环境图转成 CubeMap
- 生成 Diffuse IBL（环境漫反射）
- 生成 Specular IBL（高光/反射，随粗糙度变化）
- 生成 BRDF LUT（把复杂积分压缩成 2D 查表）

**Diffuse IBL（漫反射环境）**->`CaptureDiffuseIrradiance(...)`，让 `pbr_1_ps.hlsl` 的`ambient diffuse`能直接从这张图采样出来
**Specular IBL（镜面/反射环境，随 roughness 变化）**->`CapturePrefilteredColor(...)`，让运行时的镜面反射可以通过“查表 + 采样不同 roughness 对应的模糊程度”得到，而不用每个像素都积分。
**BRDF LUT（把镜面积分压缩成查表）**->`GenerateBRDF(...)`，降低运算量，利用LUT快速查表。

```cpp
void RenderOneFrame(float inDeltaTime)
```
- 更新相机
- HDR 离屏渲染 pass + 画Skybox和PBR物体 + 结束pass渲染
- Tone Mapping pass：把 HDR 结果输出到 swapchain

```cpp
void InitSphere(ID3D12GraphicsCommandList* inCommandList)
```
- 准备“主模型（DamagedHelmet）+ PBR 材质（`pbr_1_vs/ pbr_1_ps`）+ 所需贴图 + IBL 三件套”，让后续每帧能直接画出 PBR+IBL 效果的物体。

```cpp
void InitSkyBox(ID3D12GraphicsCommandList* inCommandList)
```
- 准备天空盒网格 + 天空盒材质，让屏幕里能看到环境，同时方向上和你 IBL 用的环境贴图保持一致。

```cpp
void InitToneMapping(ID3D12GraphicsCommandList* inCommandList)
```
- 准备一个“全屏四边形”的材质和网格，让每帧把 HDR FBO 的颜色纹理（浮点高亮结果）做 tone mapping，变成屏幕能显示的颜色。

# Capture

把一堆复杂的光照积分，提前在初始化阶段用 GPU 渲染到纹理里（离屏渲染），生成 IBL 需要的查表/预滤波结果。
不断切换 RTV 到不同面/不同 mip，然后调用 `node[i]->Draw(...)` 去“把 shader 计算出来的结果写进纹理”。

```cpp
void InitMatrices()
```
- 准备 6 个方向的“摄像机”

```cpp
ID3D12Resource* HDRI2CubeMap()
```
- 把 HDRI 变成能采样的立方体环境图

```cpp
ID3D12Resource* LoadHDRICubeMapFromFile()
```
- 加载 HDRI（2D 浮点纹理）
- 把 2D HDRI 转成 CubeMap

```cpp
ID3D12Resource* CaptureDiffuseIrradiance()
```
- 生成漫反射环境光（Diffuse IBL）

```cpp
ID3D12Resource* CapturePrefilteredColor()
```
- 生成 Specular IBL（镜面预滤波，随 roughness 变糊）

```cpp
ID3D12Resource* GenerateBRDF()
```



# Node
一个场景中的“物体实体”：内部挂着网格组件（Mesh）和材质（Material），同时负责把模型矩阵、视图矩阵、投影矩阵等 变换矩阵打包进一个常量缓冲，传给 GPU。

Node.h中：
```C++
#pragma once
#include "Utils.h"
#include "Mesh.h"
#include "BattleFireDirect3D12.h"
class Camera;
class Node {
public:
	
	StaticMeshComponent* mStaticMeshComponent;
	SkinedMeshComponent* mSkinedMeshComponent;
	Mat4UniformBufferData* mMat4UniformBufferData;
	DirectX::XMMATRIX mModelMatrix;
	Node();
	void UpdateConstantBufferData(DirectX::XMMATRIX&inProjectionMatrix, DirectX::XMMATRIX& inViewMatrix);
	void UpdateModelMatrix();
	void SetPosition(float inX, float inY, float inZ);
	void Draw(ID3D12GraphicsCommandList* inCommandList, DirectX::XMMATRIX& inProjectionMatrix, Camera& inCamera, DXGI_FORMAT inColorRTFormat, DXGI_FORMAT inDSRTFormat);
};
```


# SUNDirect3D12

## GPUProgram

“在我的 SUNDirect3D12 框架里，我用一个 `GPUProgram` 类来统一管理 HLSL 着色器的编译和缓存。  
上层只要给 VS/PS 的文件路径，调用 `GetGPUProgram`，内部会先查一遍缓存；如果从没用过这对 shader，就自动调用 `D3DCompileFromFile` 编译 `vs_5_0` 和 `ps_5_0`，封装成 `D3D12_SHADER_BYTECODE` 给 PSO 使用，并把结果存在一个全局的 hash 表里。  
这样，同一套 VS/PS 在工程中只会编译一次，不但简化了 PSO 创建代码，也减少了运行时代码重复编译的开销，最后用 `CleanUp` 统一释放所有 shader 资源。”

在 D3D12 里，GPU 不能直接读 `.hlsl` 文件，必须先把 HLSL 源码“编译”成二进制字节码（`ID3DBlob`），再把这个字节码塞进 PSO 里用。

`GPUProgram`专门负责编译 HLSL 着色器（VS 和 PS）；缓存结果（同一组 VS/PS 只编译一次）；
把结果封装成 D3D12 需要的 D3D12_SHADER_BYTECODE 结构，方便创建 PSO 时直接用。

Q：不做这个设计，会出现什么问题？

A：Direct3D 12 中创建 PSO 必须传入 编译后的 shader 字节码（D3D12_SHADER_BYTECODE），而不是原始 HLSL 文件；如果没有缓存，每次创建 PSO（哪怕是同一个 VS/PS 组合），都要调用 D3DCompileFromFile 重新编译 HLSL：编译是 CPU 密集型操作，频繁编译会导致启动慢、运行时卡顿；每次编译都会生成一份独立的 shader 字节码内存块，同一套 VS/PS 被编译 N 次，就会占用 N 倍内存；极端场景（比如一个场景有上百个 PSO 但共用少量 VS/PS），重复编译的开销会被放大。

## Texture+FrameBufferRT优化

框架中`FrameBufferRT`结构体（定义在BattleFireDirect3D12.h的 34-37 行）封装了`Texture`类型的颜色缓冲区（`mColorBuffer`）和深度 / 模板缓冲区（`mDSBuffer`）；而`Texture`类型包含渲染目标相关的核心资源（`ID3D12Resource*`）、描述符堆（`ID3D12DescriptorHeap*`）、RTV 句柄（`D3D12_CPU_DESCRIPTOR_HANDLE`）、格式（`DXGI_FORMAT`）等关键描述信息。通过`FrameBufferRT`做统一封装。

Q：不做这个设计，会出现什么问题？

A：上层渲染逻辑需要分别获取颜色缓冲区、深度缓冲区的资源句柄、描述符、格式等零散信息，代码需适配不同的获取方式，渲染接口杂乱且易出错；

## 框架底层控制中心（开/关）

“SUNDirect3D12 这一层本质上是一个一体化的渲染控制开关：用 InitializeDirect3D12 一次性把设备和交换链配好，用 Wait/Begin/End/Present 固定每一帧的节奏，再配合 RHICommandList 管理命令列表生命周期，上层做 PBR 和 IBL 时只需要关心‘画什么’，而不用反复处理 Direct3D12 的底层模板代码和同步细节。”

初始化+设备获取+帧同步/交换链+命令套装

Q：不做这个设计，会出现什么问题？

A：任何创建 Buffer/Texture/PSO 的函数都会因为拿不到 Device 而失败，整个渲染系统无法启动。

## RHICommandList

“我把 D3D12 命令列表这一整套使用流程做成了一个 RAII 封装 `RHICommandList`。  
构造时内部调用 `GetCommandList` 去 Reset 命令列表，析构时自动调用 `EndCommandList` 去 Close + Execute + Signal Fence。  
这样上层代码只关心在 `mCommandList` 上录制 Draw 命令，它自动完成 Reset / Close / Execute / Signal，不需要每个 Pass 都重复写模板代码，也大幅降低了忘记 Close 或 Signal 这种低级错误的风险。”

## 工具模块

在 SUNDirect3D12 里，我把所有“和 GPU 打交道的底层细节”收敛到了几组工具函数里：  
用 `GenBufferObject / GenConstantBuffer / UpdateConstantBuffer` 来统一创建和更新各种 Buffer；  
用 `CreateTexture2D / LoadHDRITextureFromFile / CreateTextureCube` 来统一加载 2D 纹理、HDR 环境贴图和立方体贴图；  
用 `GenPipelineStateObject` 系列来一键生成 PSO，里面已经约定好输入布局、RootSignature、默认光栅 / 深度 / 混合状态。  
上层的 `Scene`、`FrameBuffer`、`Captures`、`Material` 都只调用这些工具，而不用自己处理 `GetCopyableFootprints`、资源状态切换和一大坨 PSO 描述字段，这样既减少了模板代码，又降低了出错概率。

# main

“在入口的 `main.cpp` 里，我没有把复杂逻辑堆在 WinMain，而是只做了两件事：
一是用 Win32 API 创建一个 1280×720 的窗口，然后调用 `InitializeDirect3D12` 和 `InitScene` 一次性把 D3D12 设备和 PBR 场景配好；
二是在消息循环里，当没有窗口消息时，按固定节奏执行 `WaitForPreviousFrame → RenderOneFrame(deltaTime) → Direct3DSwapBuffers`。
这样主循环就变成了一个非常清晰的‘驱动层’，而具体的渲染细节都交给 `SUNDirect3D12` 和 `Scene` 这两个模块去处理。”

`main.cpp` 就是在干两件事：
- 程序启动时：创建一个 Win32 窗口 → 初始化 D3D12 框架（`InitializeDirect3D12`）→ 初始化场景（`InitScene`）。
- 程序运行中：在消息循环里，每帧算一下 `deltaTime` → 调你的 RHI 一整套：`WaitForPreviousFrame → RenderOneFrame → Direct3DSwapBuffers`。

```cpp
LPCTSTR sWindowClassName = L"Direct3D12RenderWindow";
LPCTSTR sWindowTitle = L"Direct3D 12 Render Window";
```
- 描述了窗口的名字和标题

```cpp
LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
```
- Win32 程序的标准写法，操作系统把各种消息发给这个 `WindowProc`。这里只特别处理了 `WM_CLOSE`，其他所有消息都交给默认实现 `DefWindowProc`。

```cpp
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
```
- 这是 Windows 程序的入口函数，相当于控制台程序的 `main`。
- 其内部代码都是和创建窗口有关，与渲染无关，以下讲解其中的部分代码。

```cpp
// 这两行代码是在Direct框架中定义的
InitializeDirect3D12(hwnd, 1280, 720);
InitScene(1280, 720);
```
- 用窗口句柄 `hwnd` 创建 DXGI Factory、Device、SwapChain；
- 创建后缓冲的 RTV、深度缓冲 DSV；
- 创建命令队列、命令列表、Fence 等；
- 初始化全局 RootSignature 等。
- 创建 HDR FrameBuffer（`gHDRFBO`）；
- 用 `Captures` 把 HDR 环境图处理成 DiffuseIrradiance / PrefilteredColor / BRDFLUT；
- 创建 Skybox Node、PBR 模型 Node、Tone Mapping FullScreenQuad；
- 设置投影矩阵和主摄像机。
到这里：窗口 + D3D12 设备 + 场景全部就绪，只差主循环不断“驱动”这一切。

```cpp
PeekMessage(&msg, NULL, NULL, NULL, PM_REMOVE)
```
- 不断从消息队列里取消息（键盘、鼠标、窗口事件等）
