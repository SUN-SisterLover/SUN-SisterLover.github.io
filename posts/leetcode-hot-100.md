---
id: leetcode-hot-100
index: '43'
title_zh: '【算法机试】LeetCodeHot100'
title_en: 'LeetCode Hot 100'
excerpt_zh: '该做题记录是在本人很久没有写代码（被Agent控制了一段时间之后），重新开始捡起来cpp有关的基础语法，所以需要好好打磨一些东西。'
excerpt_en: 'Picking C++ back up after a long break — grinding the Hot 100 list.'
tags: ['NOTE']
date: '2026.07.16'
readTime: '1 min'
---

该做题记录是在本人很久没有写代码（被Agent控制了一段时间之后），重新开始捡起来cpp有关的基础语法，所以需要好好打磨一些东西。
## 两数之和

[1. 两数之和 - 力扣（LeetCode）](https://leetcode.cn/problems/two-sum/description/?envType=study-plan-v2&envId=top-100-liked)
**我的解法：暴力**
找到一个元素之后，直接从他的下一位开始往后遍历，找完，直到满足`nums[i] + nums[j] == target`
```cpp
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        vector<int> answer;
        for (int i = 0; i < nums.size(); i++){
            for (int j = i + 1; j < nums.size(); j++){
                if (nums[i] + nums[j] == target){
                    answer.push_back(i);
                    answer.push_back(j);
                }
            }
        }
        return answer;
    }
};
```
**更好的解法：哈希**
原本方法中每次遍历后面的数都出现了一个问题，那就是每次都是这样一套流程：获取了第一个数字，然后去查后面的数，两个加一起还要算一下是否满足target的值。
实际上，我们本质的目标就是希望找到一个数，它的大小是target减去其中的某个数存在就行。也就是说，每个数其实都对应了一个target - 这个数本身。
那么我们可以做一张哈希表，把数本身和他的位置对应起来，然后每次我们就去这张哈希表里面查找，哈希表中查找的速度是O(1)。
```cpp
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> hashtable;
        for (int i = 0; i < nums.size(); ++i) {
            auto it = hashtable.find(target - nums[i]);
            if (it != hashtable.end()) {
                return {it->second, i};
            }
            hashtable[nums[i]] = i;
        }
        return {};
    }
};
作者：力扣官方题解
链接：https://leetcode.cn/problems/two-sum/solutions/434597/liang-shu-zhi-he-by-leetcode-solution/
```
