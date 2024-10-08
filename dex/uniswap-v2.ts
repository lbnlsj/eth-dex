import { ethers } from 'ethers';
import * as eth from '../assets/eth';
import * as bsc from '../assets/bsc';
import * as base from '../assets/base';
import * as arb from '../assets/arb';

const FACTORY_ABI = ['function getPair(address tokenA, address tokenB) external view returns (address pair)'];
const PAIR_ABI = [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];
const ERC20_ABI = [
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)',
    'function balanceOf(address account) external view returns (uint256)'
];
const ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

interface TokenInfo {
    name: string;
    dex: string;
    liquidity: {
        token: string;
        weth: string;
    };
    price: number;
    marketValue: number;
    id: string;
    vol24h: number;
    rawInfo: any;
}

interface ChainConfig {
    rpcUrl: string;
    uniswapV2FactoryAddress: string;
    uniswapV2RouterAddress: string;
    wethAddress: string;
}

const chainConfigs: { [key: string]: ChainConfig } = {
    eth: {
        rpcUrl: eth.rpcUrl,
        uniswapV2FactoryAddress: eth.uniswapV2FactoryAddress,
        uniswapV2RouterAddress: eth.uniswapV2RouterAddress,
        wethAddress: eth.wethAddress
    },
    bsc: {
        rpcUrl: bsc.rpcUrl,
        uniswapV2FactoryAddress: bsc.uniswapV2FactoryAddress,
        uniswapV2RouterAddress: bsc.uniswapV2RouterAddress,
        wethAddress: bsc.wethAddress
    },
    base: {
        rpcUrl: base.rpcUrl,
        uniswapV2FactoryAddress: base.uniswapV2FactoryAddress,
        uniswapV2RouterAddress: base.uniswapV2RouterAddress,
        wethAddress: base.wethAddress
    },
    arb: {
        rpcUrl: arb.rpcUrl,
        uniswapV2FactoryAddress: arb.uniswapV2FactoryAddress,
        uniswapV2RouterAddress: arb.uniswapV2RouterAddress,
        wethAddress: arb.wethAddress
    }
};

async function fetchPoolByMints(chainName: string, mint: string): Promise<TokenInfo> {
    const config = chainConfigs[chainName];
    if (!config) {
        throw new Error(`Unsupported chain: ${chainName}`);
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const factory = new ethers.Contract(config.uniswapV2FactoryAddress, FACTORY_ABI, provider);
    const token = new ethers.Contract(mint, ERC20_ABI, provider);

    const [symbol, decimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
    ]);

    const pairAddress = await factory.getPair(mint, config.wethAddress);
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);

    const [token0, token1, reserves] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
    ]);

    const isToken0 = token0.toLowerCase() === mint.toLowerCase();
    const [tokenReserve, wethReserve] = isToken0 ? [reserves[0], reserves[1]] : [reserves[1], reserves[0]];

    const tokenLiquidity = Number(ethers.formatUnits(tokenReserve, decimals));
    const ethLiquidity = Number(ethers.formatUnits(wethReserve, 18));
    
    const price = ethLiquidity / tokenLiquidity;
    const marketValue = ethLiquidity * 2; // Approximation, assuming equal value on both sides

    // Note: vol24h is not available from on-chain data, you might need to use an API for this
    const vol24h = 0;

    return {
        name: symbol,
        dex: 'uniswapV2',
        liquidity: {
            token: tokenLiquidity.toFixed(6),
            weth: ethLiquidity.toFixed(6),
        },
        price: price,
        marketValue: marketValue,
        id: pairAddress,
        vol24h: vol24h,
        rawInfo: {
            token0,
            token1,
            reserves: reserves.toString(),
            pairAddress,
            fee: '0.3 %'
        },
    };
}

async function swap(
    chainName: string,
    mintStr: string,
    action: 'buy' | 'sell',
    amount: number,
    privateKey: string,
    info: TokenInfo,
    slippage: number
) {
    const config = chainConfigs[chainName];
    if (!config) {
        throw new Error(`Unsupported chain: ${chainName}`);
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const router = new ethers.Contract(config.uniswapV2RouterAddress, ROUTER_ABI, signer);

    const path = action === 'buy' ? [config.wethAddress, mintStr] : [mintStr, config.wethAddress];
    const tokenIn = path[0];
    const tokenOut = path[1];

    const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    const amountIn = ethers.parseUnits(amount.toString(), decimals);

    const amounts = await router.getAmountsOut(amountIn, path);
    const amountOutMin = amounts[1] * BigInt(Math.floor((1 - slippage / 100) * 1e18)) / BigInt(1e18);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    console.log('Swap Parameters:', {
        action,
        amountIn: amountIn.toString(),
        amountOutMin: amountOutMin.toString(),
        path,
        deadline
    });

    // Note: Actual swap execution is commented out for safety
    return 'Transaction hash would be returned here';
}

async function test() {
    // Example usage for fetchPoolByMints
    const ETH_UNI_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
    const ethTokenInfo = await fetchPoolByMints('eth', ETH_UNI_ADDRESS);
    console.log('Ethereum UNI Pool Info:', JSON.stringify(ethTokenInfo, null, 2));

    const BASE_TOKEN_ADDRESS = '0x32C30d4B4dB4Ed08af086250e8075E1088a3E579'; // Replace with a real token address on Base
    const baseTokenInfo = await fetchPoolByMints('base', BASE_TOKEN_ADDRESS);
    console.log('Base Token Pool Info:', JSON.stringify(baseTokenInfo, null, 2));

    // Example usage for swap function (commented out for safety)
    /*
    const privateKey = 'your_private_key_here';
    const slippage = 0.5; // 0.5% slippage
    const txHash = await swap('eth', ETH_UNI_ADDRESS, 'buy', 0.1, privateKey, ethTokenInfo, slippage);
    console.log('Transaction Hash:', txHash);
    */
}

test();