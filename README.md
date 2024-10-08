# Uniswap V2 和 V3 测试指南

本指南将帮助您测试 Uniswap V2 和 V3 在不同链上的功能。

## 项目结构

```
project_root/
├── assets/
├── dex/
│   ├── uniswap-v2.ts
│   └── uniswap-v3.ts
├── node_modules/
├── test/
├── .gitignore
├── package-lock.json
├── package.json
├── README.md
└── tsconfig.json
```

## 前提条件

1. Node.js (v14 或更高版本) 和 npm
2. TypeScript 的基本知识
3. 区块链和 Uniswap 概念的基本理解
4. Infura API 密钥（如果没有，请在 https://infura.io 注册）

## 环境设置

1. 克隆或下载项目到本地。

2. 在项目根目录打开终端，运行以下命令安装依赖：
   ```
   npm install
   ```

3. 确保 `assets` 文件夹中包含了所有必要的配置文件（如 `eth.ts`, `base.ts` 等）。

## 运行测试

### 测试 Uniswap V2

1. 打开 `dex/uniswap-v2.ts` 文件。

2. 在文件底部找到或创建 `test` 函数，根据需要修改测试参数。例如：

   ```typescript
   async function test() {
     const ETH_TOKEN_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'; // UNI token
     const ethTokenInfo = await fetchPoolByMints('eth', ETH_TOKEN_ADDRESS);
     console.log('Ethereum UNI Pool Info (V2):', JSON.stringify(ethTokenInfo, null, 2));
     
     // 添加其他链的测试...
   }
   
   test().catch(console.error);
   ```

3. 在终端中运行以下命令执行 V2 测试：
   ```
   npx ts-node dex/uniswap-v2.ts
   ```

### 测试 Uniswap V3

1. 打开 `dex/uniswap-v3.ts` 文件。

2. 类似地，在文件底部找到或创建 `test` 函数，根据需要修改测试参数。例如：

   ```typescript
   async function test() {
     const ETH_TOKEN_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'; // UNI token
     const ethTokenInfo = await fetchPoolByMints('eth', ETH_TOKEN_ADDRESS);
     console.log('Ethereum UNI Pool Info (V3):', JSON.stringify(ethTokenInfo, null, 2));
     
     // 添加其他链的测试...
   }
   
   test().catch(console.error);
   ```

3. 在终端中运行以下命令执行 V3 测试：
   ```
   npx ts-node dex/uniswap-v3.ts
   ```

## 测试不同的链和代币

要测试不同的链或代币，请在各自的测试函数中添加或修改相应的代码：

1. 以太坊（ETH）：
   ```typescript
   const ETH_TOKEN_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'; // UNI 代币
   const ethTokenInfo = await fetchPoolByMints('eth', ETH_TOKEN_ADDRESS);
   console.log('以太坊代币池信息：', JSON.stringify(ethTokenInfo, null, 2));
   ```

2. Base：
   ```typescript
   const BASE_TOKEN_ADDRESS = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'; // Base USD
   const baseTokenInfo = await fetchPoolByMints('base', BASE_TOKEN_ADDRESS);
   console.log('Base 代币池信息：', JSON.stringify(baseTokenInfo, null, 2));
   ```

3. 币安智能链（BSC）：
   ```typescript
   const BSC_TOKEN_ADDRESS = '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47'; // BSC 上的 Cardano 代币
   const bscTokenInfo = await fetchPoolByMints('bsc', BSC_TOKEN_ADDRESS);
   console.log('BSC 代币池信息：', JSON.stringify(bscTokenInfo, null, 2));
   ```

4. Arbitrum：
   ```typescript
   const ARB_TOKEN_ADDRESS = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'; // Arbitrum 上的 USDC
   const arbTokenInfo = await fetchPoolByMints('arb', ARB_TOKEN_ADDRESS);
   console.log('Arbitrum 代币池信息：', JSON.stringify(arbTokenInfo, null, 2));
   ```

## 注意事项

- 确保在测试前更新 Infura API 密钥或其他 RPC 提供商的 URL。
- 测试交换功能时，使用小额资金或测试网络。
- 保护好您的私钥，不要将其硬编码或提交到版本控制系统中。
- V2 和 V3 的接口和功能可能有所不同，请注意区分。
- 某些链可能只支持 V2 或 V3，请根据实际情况调整测试。

按照本指南，您应该能够测试 Uniswap V2 和 V3 在不同链上的功能。如果遇到任何问题，请检查配置文件和网络连接，并确保使用了正确的合约地址和 ABI。