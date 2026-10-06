---
id: cg-17-materials-appearances
index: '41'
title_zh: '17-Materials and Appearances'
title_en: 'Materials and Appearances'
excerpt_zh: '同一只杯子的 3D 模型（线框 / 网格）不变——几何（顶点、三角面）是同一套；换的是与光交互的规则：颜色、粗糙度、是否有高光、是否透明、表面是否有纹理（奶泡拉'
excerpt_en: 'Same geometry, different light-interaction rules: color, roughness, specularity, transparency, texture.'
tags: ['计算机图形学', '材质', '外观', 'BRDF', 'Lambertian', 'GAMES101']
date: '2026.05.16'
readTime: '3 min'
---

# 17-Materials and Appearances

> **GAMES101 · Materials and Appearances** 笔记（节选）。辐射度量学记号与渲染方程更细的展开见 **《【渲染数学】辐射度量学与BRDF》**（同仓库 `_posts` 下对应 md）；光追管线里「求交之后怎么着色」可与 **13～16 光追系列** 对照。

## 图形学里「材质」是什么

同一只杯子的 **3D 模型（线框 / 网格）不变——几何（顶点、三角面）是同一套；换的是与光交互的规则**：颜色、粗糙度、是否有高光、是否透明、表面是否有纹理（奶泡拉花等）。**渲染**就是在给定几何上，用不同材质参数算出不同**外观（appearance）**。

一句话：**几何描述「长什么样」；材质描述「光打上去之后看起来怎样」。**

## Material 与 BRDF（课件）

课上常直接给等价关系：

$$
\text{Material} \equiv \text{BRDF}
$$

实现里「换材质」多半就是换**双向反射分布函数** $f_{\mathrm{r}}(\mathrm{p},\omega_{\mathrm{i}},\omega_{\mathrm{o}})$（略去空间位置 $\mathrm{p}$ 时写作 $f_{\mathrm{r}}$）。更完整的辐射度量与方程见辐射度量学那篇，这里只记**本讲要用的结论**。

## 这是什么材质？（理想漫反射 / Lambert）

课件图：一条入射光打到平面上，出射方向在**上半球**里**各向同性**：许多出射箭头长度相同、沿半球均匀散开——这是**理想漫反射（Diffuse / Lambertian）**：反射辐射亮度**与观察方向 $\omega_{\mathrm{o}}$ 无关**，只与入射与法向的关系、以及表面反照率有关。

## 均匀色 vs 纹理漫反射（Mitsuba 例图）

- **Uniform colored diffuse BRDF**：球体单色、**哑光**，无锐利高光斑；明暗随法向相对光源变化，是典型 Lambert。
- **Textured diffuse BRDF**：仍是漫反射模型，但用**纹理**调制反照率（颜色随表面位置变），例如木纹——**BRDF 形状仍是漫反射**，变的是「每个点的 $\rho$」。

## 理想漫反射的 BRDF 与反照率 $\rho$（课件推导）

设入射辐射亮度在半球上**均匀**（与 $\omega_{\mathrm{i}}$ 无关），且 BRDF 为**常数** $f_{\mathrm{r}}=c$。反射方程（半球 $\mathcal{H}^2$，课件记为 $H^2$）写为

$$
L_{\mathrm{o}}(\omega_{\mathrm{o}})=\int_{\mathcal{H}^{2}} f_{\mathrm{r}}L_{\mathrm{i}}(\omega_{\mathrm{i}})\cos\theta_{\mathrm{i}}\mathrm{d}\omega_{\mathrm{i}}
$$

其中 $\theta_{\mathrm{i}}$ 为入射方向与法向夹角，$\cos\theta_{\mathrm{i}}$ 即几何项。把常数提出：

$$
L_{\mathrm{o}}(\omega_{\mathrm{o}})=f_{\mathrm{r}}L_{\mathrm{i}}\int_{\mathcal{H}^{2}}\cos\theta_{\mathrm{i}}\mathrm{d}\omega_{\mathrm{i}}
$$

半球上 $\cos$ 的积分为 $\pi$，故

$$
L_{\mathrm{o}}(\omega_{\mathrm{o}})=\pi f_{\mathrm{r}} L_{\mathrm{i}}
$$

定义**反照率（albedo）** $\rho$（常理解为「颜色 / 反射比例」，取值常在 $[0,1]$）并取**能量守恒**下的 Lambert BRDF：

$$
f_{\mathrm{r}}=\frac{\rho}{\pi}
$$

于是 $L_{\mathrm{o}}=\rho L_{\mathrm{i}}$（在均匀 $L_{\mathrm{i}}$ 与理想 Lambert 假设下与直觉一致）。路径追踪里对漫反射面做**半球余弦采样**时，概率密度与 $\cos\theta$ 配合后，用的就是这一套能量归一。

### 化简之后「效果」是什么：$\rho$ 在照过来的一束光里干什么

上面 $L_{\mathrm{o}}=\rho L_{\mathrm{i}}$ **只在**「入射亮度从各个方向都一样」这种**教学化假设**下成立，用来把 **$\rho$** 和 **能量守恒里的 $1/\pi$** 一次说清楚。真实场景里 $L_{\mathrm{i}}(\omega_{\mathrm{i}})$ 一般**随方向变**（点光源、环境贴图、阴影等），要用完整反射积分，但 **$\rho$ 扮演的角色不变**：

- **$\rho$ 是「颜色 × 反射强度」的乘子**（常按 RGB 三个通道各在 $[0,1]$ 左右）。同样照明、同样法向时，**$\rho$ 越大，表面越亮、越「吃光少」**；**$\rho$ 越小，越暗、越吸光**。PBR 里常把它想成 **Base Color / 反照率贴图** 在控制的量。
- **为什么要除以 $\pi$**：$f_{\mathrm{r}}$ 乘上 $L_{\mathrm{i}}\cos\theta$ 再在半球积分时，那个 $\pi$ 会和「半球上 $\cos$ 的积分」**对上号**，保证**漫反射不会反射出比入射更多的能量**（各通道意义下）。所以 **$\rho$ 是「你想让表面有多亮」**，**$\pi$ 是「积分几何里自动多出来的系数」**，合在一起写进 $f_{\mathrm{r}}$ 里，实现里就不用每次手算半球常数。
- **「一束光打过来」**若你指的是**点光源 + 漫反射**：直观上仍有「**照到表面的光越强 → 出射越亮**」，但公式里还会出现**法向与光方向的 $\cos$**、**距离平方反比**等，**不再是**简单的 $L_{\mathrm{o}}=\rho L_{\mathrm{i}}$ 一行；**$\rho$ 仍然只是乘在「经 BRDF 与积分算出来的那份结果」上的表面固有参数**——你可以把它记成：**光照算「有多少光撞上」；$\rho$ 算「撞上的里面反射出多少、什么颜色」。**

路径追踪里用余弦采样时，会把 **$1/\pi$ 与 PDF 里的 $\cos$ 因子**在估计里配平，使得**用随机方向估计积分仍然无偏**；那是实现细节，和「$\rho$ 控制明暗与色相」的直觉不冲突。

## （后续占位）

- **Glossy / 镜面 / 透射**、微表面模型、Fresnel 等按课继续往下列小节。
- 与 **Disney BRDF / PBR** 若课上有对照，可在此补一行索引。

---
