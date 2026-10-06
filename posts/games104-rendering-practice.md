---
id: games104-rendering-practice
index: '10'
title_zh: '游戏引擎中的渲染实践'
title_en: 'GAMES104: Rendering Practice in Game Engines'
excerpt_zh: '游戏渲染和现代图形学之间有着较大的差异，主要是因为其面向的环境不同：'
excerpt_en: 'Game rendering differs from modern graphics theory mainly because of the environments they target.'
tags: ['计算机图形学', '游戏引擎', 'Games系列']
date: '2026.02.22'
readTime: '2 min'
---

# 游戏渲染中的挑战

游戏渲染和现代图形学之间有着较大的差异，主要是因为其面向的环境不同：

1.游戏渲染系统非常复杂，包含大量的game object和不同的效果；

2.要深度适配现代硬件架构，GPU、CPU；

3.对高帧率与高分辨率越来越高的要求；

4.对CPU性能的有限使用，因为CPU除了渲染之外还要为游戏逻辑、网络、物理、ai系统提供算力。

# 渲染系统的对象

此部分适合看Games101，在此不多赘述。

# 了解GPU

SIMD（Single Instruction Multiple Data）单指令多数据流，并发编程。例如向量运算（x,y,z），一个指令可以完成三个运算。

SIMT（Single Instruction Multiple Threads）单指令多线程，可以理解为把多个SIMD同时运行，SIMT+SIMD使显卡运算量运算速度大量提升。



# 可见性裁剪

以下对几种方法进行介绍：

## BVH方法

BVH（Bounding volume hierarchy）即层次包围体，这是一种用来管理3D场景中物体的方法。在BVH中，所有的几何物体都会被包在bounding volume的叶子节点里面，bounding volume外面继续包着一个更大的bounding volume，递归地包裹下去，最终形成的根节点会包裹着整个场景。常用于碰撞检测和光线追踪的加速，能够将时间复杂度降低到关于物体数量的对数级别。

举例：找个volume包围10个物体，如果射线没击中这个volume，那么射线肯定没击中这10个物体。

参考Blog：[【光线追踪系列十】光追加速结构(BVH树)-CSDN博客](https://blog.csdn.net/qq_35312463/article/details/108419276)

## PVS方法

PVS（Potential Visibility Set）可以理解为透过房间的门和窗最多能看到的房间。该方法也可以用于资源的加载。

这里还会涉及到一个知识，包围盒

AABB包围盒，比较简单，就不讲了。
# 贴图压缩

游戏引擎不会直接使用JPG、PNG等格式，也不会使用比较主流的一些压缩算法，因为这些格式的纹理不能做到随机访问，无法高效的读取某个像素点的颜色。

一种方法是使用BC，游戏引擎会将一个图片切割成多个4\*4的小块，选择该块中最亮和最暗的两种颜色，将其中的所有其他颜色都视作这两个颜色的插值。

# 建模工具

感觉没有什么多说的，无非是blender，zbrush之类的工具……

# 渲染管线

背景：游戏的数据量越来越大，例如，模型细节增多，游戏场景增大。这种进步对游戏引擎架构提出更高要求。

Cluster-Based Mesh Pipeline：引擎新的发展方向，两个重要的idea：一是把mesh面片按照一个数量进行分组，根据距离的远近呈现不同面片细分度的mesh模型，这个功能大多数可以通过代码自动化生成；二是根据摄像机的方向和距离动态剔除模型不需要被渲染的面片。UE5的Nanite可以理解为在Cluster-Based Mesh Pipeline基础上的优化。
