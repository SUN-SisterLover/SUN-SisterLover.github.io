---
id: pbd-algorithm
index: '49'
title_zh: 'PBD算法'
title_en: 'PBD Algorithm'
excerpt_zh: 'PBD（Position Based Dynamics）是一种用于模拟物体物理行为和运动的算法。其核心思想是离散化物体的运动方程，将其分解为一系列迭代步骤，每一'
excerpt_en: 'Position Based Dynamics discretizes motion equations into iterative position-projection steps.'
tags: ['物理模拟', '图形学', 'PBD', '算法']
date: '2026.09.06'
readTime: '6 min'
---

# PBD（Position Based Dynamics）算法

## 简介

**PBD**（Position Based Dynamics）是一种用于模拟物体物理行为和运动的算法。其核心思想是**离散化物体的运动方程**，将其分解为一系列迭代步骤，每一步都用来更新物体的位置和速度。这些迭代步骤可以模拟多种物理现象，包括弹性、碰撞、液体流动等。

PBD 通过**直接操控物体的空间位置**来模拟物理行为，而非传统基于牛顿力的动力学 **FBD**（Force-Based Dynamics）那样依赖力的计算和数值积分：

| 范式 | 求解链 |
| :--- | :--- |
| **FBD** | 力 → 加速度 → 速度 → 位置 |
| **PBD** | 预测位置 → 约束投影 → 修正位置 → 反推速度 |

## PBD vs FBD 对比

| 维度  | **PBD**                  | **FBD**                       |
| :-- | :----------------------- | :---------------------------- |
| 全称  | Position-Based Dynamics  | Force-Based Dynamics          |
| 思路  | 直接处理位置和约束，**位置驱动**，跳过力计算 | 基于牛顿力学计算**力 → 加速度 → 速度 → 位置** |
| 优点  | 高效、稳定、实时性好               | 更精确                           |
| 缺点  | 不如 FBD 精确                | 计算量大、不太稳定                     |

物体之间约束通常基于位置/旋转（两点间距、相邻三角面夹角、四面体体积等），求解约束时直接修改位置更简单，数值稳定性好。

---

## FBD 的三个核心问题

### 问题一：积分的数值不稳定性

牛顿第二定律 $a = F/m$，加速度积分得速度，速度积分得位置。模拟是离散的（真实世界连续，计算机只能一帧一帧算），"积分"实际上是用时间步长 $\Delta t$ 做近似累加：

$$
v(t + \Delta t) = v(t) + a \cdot \Delta t
$$

$$
x(t + \Delta t) = x(t) + v \cdot \Delta t
$$

这种近似累积每一步都有误差，步长越大误差越大——这就是**数值不稳定性**的来源。

### 问题二：刚体碰撞的力爆炸

比如球落地时接触时间只有 $0.001$ 秒，这期间地面给球的力极大（$F = \Delta p / \Delta t$，时间越短力越大）。如果依旧用 $a = F/m$ 再积分，步长稍微大一点点，这个巨大的力就会让速度爆炸，球直接飞上天。

### 问题三：约束本身就是位置方程

碰撞、布料、软体这些模拟里的"约束"——

- 布料拉扯时相邻点的距离不变 → 其实是布料内部的张力
- 软体的体积不会被压缩 → 其实是内部的弹性力

——写出来都是**位置方程**：

- **碰撞不穿插**：$x$ 不能在地面以下
- **保持距离**：$\|x_i - x_j\| = L$（距离约束）
- **维持体积**：四面体顶点位置决定的体积 = 原体积

也就是说，约束的"答案"**本来就是用位置表述的**。

---

## PBD 的解法

> 预测一个位置后，**不满足约束就直接把位置修正掉**（投影到约束流形上），然后反推速度 $v = (x_{\text{new}} - x_{\text{old}}) / \Delta t$。

---

## PBD 算法主体（3 步）

1. **外力预测**：根据外力更新粒子速度位置，无需考虑粒子间关系。
2. **约束求解**：求解约束，使粒子满足粒子间关系。
3. **速度反推**：更新粒子的位置，并反向更新速度。

> 💡 **Tip**：在物理模拟领域，使用**四面体网络体**，类似于渲染中使用简单三角面，这是最简单的空间几何体。

---
## 经典 PBD 算法伪代码

（Müller et al., 2007 的标准实现）

```pseudocode
forall vertices i do
    initialize x_i = x_i^0, v_i = v_i^0, w_i = 1 / m_i
endfor

loop
    forall vertices i do
        v_i ← v_i + Δt · w_i · f_ext(x_i)
    end forall
    dampVelocities(v_1, ..., v_N)

    forall vertices i do
        p_i ← x_i + Δt · v_i
        generateCollisionConstraints(p_i ← x_i)
    end forall

    loop solverIterations times
        projectConstraints(C_1, ..., C_{M + M_coll}, p_1, ..., p_N)
    end loop

    forall vertices i do
        v_i ← (p_i - x_i) / Δt
        x_i ← p_i
    end forall

    velocityUpdate(v_1, ..., v_N)
end loop
```

| 行号区间        | 作用                                  |
| :---------- | :---------------------------------- |
| **1 ~ 3**   | 初始化：以质量倒数作为权重 $w_i = 1/m_i$         |
| **5 ~ 7**   | 不考虑约束，仅按外力更新当前时刻的速度、位置              |
| **8 ~ 11**  | 通过约束条件修正位置（迭代 `solverIterations` 次） |
| **12 ~ 16** | 更新位置，并把速度反推为"约束前后位置差 / $\Delta t$"  |

---

## Verlet 积分

PBD 处理位置和速度的方式不同于传统 FBD（力 → 加速度 → 速度 → 位置），它使用 **Verlet 积分**：用前后两个时刻的位置差值来更新速度。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260906153525.png)

> 这张图：$x$ 点的瞬时速度，假设每一帧都是一个固定的速度，所以直接用前后位置差除以时间间隔。

### 离散时间约定

- 时刻 $t_i$，则 $x_i$ 为 $t_i$ 时刻的位置
- $v_i$ 是 $t_{i-1}$ 到 $t_i$ 之间的**平均速度**（不是 $t_i$ 时刻的瞬时速度）

如果初始时 $v$ 和 $x$ 间隔半个步长（$x$ 在整数时刻，$v$ 在半整数时刻），就构成**蛙跳积分（leapfrog integration）**：

- 具有**二阶精度**（与 RK4 同阶，但简单得多）
- 可以**完美拟合匀加速运动**（匀加速的二次项精确）

### 速度反推公式

PBD 算法的第 13 行：

$$
v_i = \dfrac{p_i - x_i}{\Delta t}
$$

其中：

- $x_i$：约束求解**前**的位置
- $p_i$：约束求解**后**的位置
- $\Delta t$：时间步长

这意味着 PBD 的速度不是由"力 → 加速度"积分得到的，而是**由约束反推的**——这正是 PBD 与 FBD 的核心差异。

### 与步长无关的稳定性

Verlet 积分的关键优势在于**数值稳定性与步长无关**：

| 性质 | 说明 |
| :--- | :--- |
| 约束修正后 $x$ 始终在合法位置 | 位置永远满足约束，不会出现非法解 |
| $v$ 大小合理 | 不会出现"爆炸式"的速度 |
| 不外推，只内插 | 速度反推只用"当前位置变化量"，不会无脑外推未来位置 |
| 步长变化不影响稳定性 | 大步长也不会让系统爆炸，只会影响精度 |

这是 PBD 在游戏引擎、动画电影中被广泛采用的根本原因——**实时模拟允许用大步长换性能**。

## 约束求解的计算方法

这些约束方程一般都是非线性的，所以用牛顿迭代法来做。

**统一思路**：修正方向沿约束梯度 $\nabla C$（梯度反方向是"最快消除违反"的方向），三种情况的区别只在**缩放因子**怎么算。

如果只移动一个点，那修改的方式就是：

$$
\Delta \mathbf{p} = \lambda \, \nabla_{\mathbf{p}} C(\mathbf{p})
$$

取 $\lambda$ 使 $C(\mathbf{p} + \Delta\mathbf{p}) = 0$（一阶近似）（这里公式相当于约束被满足， $\mathbf{p} + \Delta\mathbf{p}$指的就是新位置），解得：

$$
\Delta \mathbf{p} = -\frac{C(\mathbf{p})}{|\nabla_{\mathbf{p}} C(\mathbf{p})|^2} \, \nabla_{\mathbf{p}} C(\mathbf{p})
$$


推导：一阶泰勒展开

式 5 里的"一阶近似"来自**一阶泰勒展开**：当 $\Delta \mathbf{p}$ 很小时，函数值的变化量 ≈ 梯度点乘位移：

$$
C(\mathbf{p} + \Delta \mathbf{p}) \approx C(\mathbf{p}) + \nabla_{\mathbf{p}} C \cdot \Delta \mathbf{p}
$$
**代入**修正形式 $\Delta \mathbf{p} = \lambda \, \nabla_{\mathbf{p}} C$：
   $$C(\mathbf{p}) + \lambda \, |\nabla_{\mathbf{p}} C|^2 = 0$$
**解出**：
   $$\lambda = -\frac{C(\mathbf{p})}{|\nabla_{\mathbf{p}} C|^2}$$


如果是移动多个点（质量相同的情况），那修改的方式就是：

$$
\Delta \mathbf{p}_i = -s \, \nabla_{\mathbf{p}_i} C(\mathbf{p}_1, \dots, \mathbf{p}_n)
$$

其中缩放因子 $s$ 把所有点的贡献一起归一化：

$$
s = \frac{C(\mathbf{p}_1, \dots, \mathbf{p}_n)}{\sum_j |\nabla_{\mathbf{p}_j} C(\mathbf{p}_1, \dots, \mathbf{p}_n)|^2}
$$

如果是移动多个点（质量不同的情况），那修改的方式就是：

$$
\Delta \mathbf{p}_i = \lambda \, w_i \nabla_{\mathbf{p}_i} C(\mathbf{p})
$$

解得缩放因子：

$$
s = \frac{C(\mathbf{p}_1, \dots, \mathbf{p}_n)}{\sum_j w_j |\nabla_{\mathbf{p}_j} C(\mathbf{p}_1, \dots, \mathbf{p}_n)|^2}
$$

最终修正为：

$$
\Delta \mathbf{p}_i = -s \, w_i \nabla_{\mathbf{p}_i} C(\mathbf{p}_1, \dots, \mathbf{p}_n)
$$

（论文式 8、9）

## Gauss-Seidel：多个约束的求解顺序

PBD 论文使用 **Gauss-Seidel** 方式依次求解多个约束：一次整体迭代中，前面的约束求解完、位置被改动后，**直接影响**后面约束的求解（用到的是最新位置）。

与之相对的是 **Jacobi** 方式：一次整体迭代开始前，先算出所有约束对每个点的梯度，再统一修改位置（用的是同一份旧位置）。

| | Gauss-Seidel | Jacobi |
| :--- | :--- | :--- |
| 迭代内是否即时更新位置 | 是，改完立刻生效 | 否，攒到最后一起改 |
| 收敛速度 | 更快，改动能及时传播 | 较慢 |
| 结果与约束顺序的关系 | 有关 | 无关 |
| 并行性 | 差（有顺序依赖） | 好（各点独立，可并行） |

Gauss-Seidel 的结果依赖约束求解顺序——典型例子是**链式 IK**：从父到子依次解，改动一轮就传到底；顺序反过来就慢很多。类比**随机梯度下降（SGD）**：逐条约束更新类似逐个样本更新，改动传播快，但引入顺序依赖。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260907085800.png)

## 其他调整

### 约束刚度 stiffness

将每次约束修正 $\Delta x$ 乘以系数 $k \in [0, 1]$，意图用一个旋钮表现"橡皮筋（小 $k$）到钢丝绳（$k=1$）"。

**问题：刚度依赖迭代次数。** 约束投影有"清零"特性——只要位置还违反约束，每轮就继续削掉剩余违反量。设初始违反量为 $C_0$，$n$ 轮迭代后剩余：

$$
C_n = C_0 \,(1 - k)^n
$$

只要 $k > 0$，迭代足够多次后 $C_n \to 0$——小 $k$ 随着迭代次数增多会逼近 $k = 1$ 的效果。**"软"只是收敛不完全的副产品**，同样的参数换不同的迭代次数（或帧率、步长），软硬表现就不一样。刚度不再是材料的真实物理属性。

（XPBD 的修复思路：把柔顺度 $\alpha = 1/k$ 加进求解公式的分母，使收敛目标本身带有材料决定的残差，迭代再多也不会消失。）

### 速度调整

- 可以添加**空气阻尼**（velocity damping）
- **碰撞反弹**（restitution）可以在 `velocityUpdate()` 里添加

这两步在位置修正之后做，只改速度不改位置，不影响约束的满足性。

## XPBD 扩展（速览）

XPBD（Extended PBD，Macklin et al., 2016）主要是修复上文提到的 **stiffness 依赖迭代次数**的问题，核心改动有三点：

1. **用 compliance 替代 stiffness**：柔顺度 $\alpha = 1/k$（刚度的倒数）是有物理含义的材料属性（单位：m/N），$\alpha = 0$ 表示刚性约束，$\alpha \to \infty$ 表示完全松弛。
2. **约束 = 内力与势能的关系**：给每个约束定义弹性势能
   $$U(\mathbf{x}) = \tfrac{1}{2}\, C(\mathbf{x})^\mathsf{T}\, \alpha^{-1}\, C(\mathbf{x})$$
   约束力就是这个势能的梯度 $\mathbf{F} = -\nabla U$——约束求解因此有了真实的物理意义，而不只是几何修正。
3. **引入 Lagrange 乘子 $\lambda$ 求解**：位置修正写作 $\Delta\mathbf{x} = M^{-1}\nabla C^\mathsf{T}\,\Delta\lambda$，每步求解标量增量 $\Delta\lambda$：

$$
\Delta\lambda = \frac{-C(\mathbf{x}) - \tilde{\alpha}\,\lambda}{\nabla C\, M^{-1}\, \nabla C^\mathsf{T} + \tilde{\alpha}}, \qquad \tilde{\alpha} = \frac{\alpha}{\Delta t^2}
$$

对比 PBD 的修正公式，区别只在分母多了 $\tilde{\alpha}$ 一项、分子多了 $-\tilde{\alpha}\lambda$ 一项（$\lambda$ 跨迭代累加）。

**效果**：收敛目标的残差由材料 $\alpha$ 决定，迭代次数再多也不会被"磨平"——**刚度与迭代次数、时间步长解耦**，$\alpha$ 成为不随帧率/迭代数变化的真实材料参数。
