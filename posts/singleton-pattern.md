---
id: singleton-pattern
index: '01'
title_zh: '单例模式'
title_en: 'Singleton Pattern Basics'
excerpt_zh: '这是一个非常容易引起争议的设计模式，如果你有信心管理好自己的项目，大胆的使用，如果没有，请慎重喵！'
excerpt_en: 'A highly controversial design pattern — use it boldly if you can manage your project well; otherwise, be cautious.'
tags: ['软件设计模式', 'Unity', '游戏开发', 'Csharp']
date: '2025.03.15'
readTime: '4 min'
---

# 基础介绍

这是一个非常容易引起争议的设计模式，如果你有信心管理好自己的项目，大胆的使用，如果没有，请慎重喵！

使用**单例模式**生成的实例允许其他脚本访问，例如玩家或游戏管理器，而无需先获得引用。这是一种非常高效的使用方法，尤其是在短期GameJam比赛中，使用单例模式能带来很大的便捷。

一般来说，Unity中的单例是一个全局可访问的类，存在于场景中，但仅存在一次。

其理念是任何其他脚本都能访问单例，从而轻松将对象连接到游戏的重要部分，比如与玩家或其他游戏系统。

Unity中的单例是可以添加到游戏内对象的普通类。

单例类于其的区别在于该类持有对自身类型实例的公共静态引用！

```C#
public class Singleton : MonoBehaviour 
{
    public static Singleton instance;
}
```

静态引用使单例全局可访问。

将变量设置为静态意味着该变量被该类的所有实例共享，这意味着任何脚本都可以通过其类名访问该单例，无需先引用该变量。

像这样，就是用了该变量：

```
Singleton.instance;
```

这意味着单例类中存在的任何公共方法或变量都可以被游戏中的其他脚本轻松访问。

由于任何脚本都能访问该实例变量，所以会使用**属性**来保护该实例变量，这意味着其他脚本可以读取它，但只能在自身类内设置。

像这样：

```C#
public class Singleton : MonoBehaviour 
{
    public static Singleton Instance { get; private set; }
}
```

同时，考虑到场景中应该只有一个单例实例，不能有其他的，所以需要通过检查静态引用（如果有的话）是否与脚本实例匹配。

```C#
public static Singleton Instance { get; private set; }

private void Awake() 
{ 
    // If there is an instance, and it's not me, delete myself.
    
    if (Instance != null && Instance != this) 
    { 
        Destroy(this); 
    } 
    else 
    { 
        Instance = this; 
    } 
}
```

# 为什么要使用单例？

单例是一种非常方便的方式，让你获取游戏中各个部分的数据。

可以使用单例将玩家的位置对敌人公开，或者用单例向UI界面展示玩家的生命值，也可以使用单例来制作游戏中的某个系统从而快速调用。

```C#
// 使用单例展示血量
float healthBarValue = Singleton.Instance.playerHealth;
// 使用单例的音频管理器播放音效
Singleton.Instance.PlaySound(clipToPlay);
```

# 单例的坏处

一般来说，单例会让项目规模扩大时难以管理。它们会让你的项目更难更改、更难延长，还可能引发测试问题。

日常开发者使用单例一般聚焦于两个模块，分别是Player玩家和Manager管理器。我们分别对其进行介绍。

## 游戏管理器单例

在项目中使用单例的一个主要好处是避免了将重要脚本（如游戏管理器）与可能需要访问它们的众多不同对象紧密连接。

设计音频管理器时，如果每次创建新对象时都试图在场景中寻找音频管理器，对性能可能非常不利，因此设计一个全局的音频管理器似乎是很合理的。

创建一个带有公共**播放音效**功能的**音频管理器单例**：

```C#
public void PlaySound(AudioClip clip)
{
    audioSource.PlayOneShot(clip);
}
```

现在需要播放声音的时候就可以直接这样：

```C#
public AudioClip soundEffect;
void Start()
{
    Singleton.Instance.PlaySound(soundEffect);
}
```

然而，如果一旦那你想要决定修改音效的触发方式时，就会出现问题。

游戏中有无数个对象此时都使用了你的AudioManager中的播放方式，此时如果你想要进行修改，无论是直接在这个单例本身上改，还是落地到每一个地方去修改，都几乎要对所有的代码进行改动……

因为游戏里每个声音触发器都直接连接到音频管理器，直接调用函数，传递音频片段引用。

这意味着，要改变音频管理器的工作方式，你得同时更改所有调用它的脚本。

**实际情景举例**：

如果策划希望你的金币被捡起来时候会随机播放三种不同的声音，此时你的音频管理器只能使用PlaySound，如何进行修改？

简单方案：砍死策划（

方案A（单例模式）：
这种情况下你的金币脚本极可能写着：`AudioManager.Instance.PlayerSound(goldClip);`

如果你想要实现这个随机，可能需要有一个List泛型列表和一个随机数工具。只是修改一个金币工作量不大，但是此时场景中有n个金币，不同的金币声音可能也不一样，而如果直接修改原本的PlayerSound参数列表，整个项目调用该方法的脚本全部都需要修改！

方案B（事件系统）：
这种情况下你的金币脚本可能写着：`GameEvents.OnGoldCollected?.Invoke();`

只需要在音频管理器中找到监听这个`OnGoldCollected`的地方，修改其逻辑即可，以下给一个最简单的思路：

```
if (Random.value > 0.5f) { 播放 A; } else { 播放 B; }
```

完全没有动过金币脚本，也没有动过其他任何脚本。你只改了音频管理器这一处。
## 玩家单例

单例的一个常见用途是将玩家的某些特征暴露给游戏中的其他脚本，比如玩家的位置或当前生命值。

毕竟，游戏中几乎每个物体都会以某种方式响应玩家的作，所以让他们能轻松访问玩家和脚本似乎是个好主意。

因为需要引用单例的脚本是直接引用的，每个脚本本质上都与玩家紧密相连。

这意味着在以后添加第二个玩家可能非常困难甚至不可能，这取决于玩家单人与需要访问它的脚本的紧密程度。

参考链接：
[Unity中的单例（正确作）——游戏开发初学者](https://gamedevbeginner.com/singletons-in-unity-the-right-way/)
