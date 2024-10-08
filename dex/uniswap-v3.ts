import { ethers } from 'ethers';
import * as eth from '../assets/eth';
import * as bsc from '../assets/bsc';
import * as base from '../assets/base';
import * as arb from '../assets/arb';

const FACTORY_ABI = ['function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'];
const POOL_ABI = [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function fee() external view returns (uint24)',
    'function liquidity() external view returns (uint128)',
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];
const ERC20_ABI = [
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)',
    'function balanceOf(address account) external view returns (uint256)'
];
const QUOTER_ABI = ['function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'];

interface TokenInfo {
    name: string;
    dex: string;
    liquidity: {
        token: string;
        weth: string;
    };
    price: number | BigInt;
    marketValue: number;
    id: string;
    vol24h: number;
    rawInfo: any;
}

interface ChainConfig {
    rpcUrl: string;
    uniswapV3FactoryAddress: string;
    wethAddress: string;
    uniswapV3QuoterAddress: string;
}

const chainConfigs: { [key: string]: ChainConfig } = {
    eth: {
        rpcUrl: eth.rpcUrl,
        uniswapV3FactoryAddress: eth.uniswapV3FactoryAddress,
        wethAddress: eth.wethAddress,
        uniswapV3QuoterAddress: eth.uniswapV3QuoterAddress
    },
    bsc: {
        rpcUrl: bsc.rpcUrl,
        uniswapV3FactoryAddress: bsc.uniswapV3FactoryAddress,
        wethAddress: bsc.wethAddress,
        uniswapV3QuoterAddress: bsc.uniswapV3QuoterAddress
    },
    base: {
        rpcUrl: base.rpcUrl,
        uniswapV3FactoryAddress: base.uniswapV3FactoryAddress,
        wethAddress: base.wethAddress,
        uniswapV3QuoterAddress: base.uniswapV3QuoterAddress
    },
    arb: {
        rpcUrl: arb.rpcUrl,
        uniswapV3FactoryAddress: arb.uniswapV3FactoryAddress,
        wethAddress: arb.wethAddress,
        uniswapV3QuoterAddress: arb.uniswapV3QuoterAddress
    }
};

async function fetchPoolByMints(chainName: string, mint: string): Promise<TokenInfo> {
    const config = chainConfigs[chainName];
    if (!config) {
        throw new Error(`Unsupported chain: ${chainName}`);
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const factory = new ethers.Contract(config.uniswapV3FactoryAddress, FACTORY_ABI, provider);
    const token = new ethers.Contract(mint, ERC20_ABI, provider);

    const [symbol, decimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
    ]);

    const poolAddress = await factory.getPool(mint, config.wethAddress, 3000); // Assuming 0.3% fee tier
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

    const [token0, token1, liquidity, slot0, fee] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.liquidity(),
        pool.slot0(),
        pool.fee()
    ]);

    const isToken0 = token0.toLowerCase() === mint.toLowerCase();
    const sqrtPriceX96 = slot0[0];
    const price = isToken0
        ? (Number(sqrtPriceX96) / (2 ** 96)) ** 2
        : 1 / ((Number(sqrtPriceX96) / (2 ** 96)) ** 2);

    const tokenContract = new ethers.Contract(mint, ERC20_ABI, provider);
    const wethContract = new ethers.Contract(config.wethAddress, ERC20_ABI, provider);

    const [tokenBalance, wethBalance] = await Promise.all([
        tokenContract.balanceOf(poolAddress),
        wethContract.balanceOf(poolAddress),
    ]);

    const tokenLiquidity = Number(ethers.formatUnits(tokenBalance, decimals));
    const ethLiquidity = Number(ethers.formatUnits(wethBalance, 18));
    const marketValue = ethLiquidity * 2; // Approximation, assuming equal value on both sides
    const vol24h = 0; // Note: vol24h is not available from on-chain data, you might need to use an API for this

    return {
        name: symbol,
        dex: 'uniswapV3',
        liquidity: {
            token: tokenLiquidity.toFixed(6),
            weth: ethLiquidity.toFixed(6),
        },
        price: price,
        marketValue: marketValue,
        id: poolAddress,
        vol24h: vol24h,
        rawInfo: {
            token0,
            token1,
            sqrtPriceX96: sqrtPriceX96.toString(),
            liquidity: liquidity.toString(),
            poolAddress,
            fee: (Number(fee) / 1_000_000 * 100).toString() + ' %'
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
    slippage: number,
    feeDiscount: number = 0
) {
    const config = chainConfigs[chainName];
    if (!config) {
        throw new Error(`Unsupported chain: ${chainName}`);
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const pool = new ethers.Contract(info.id, POOL_ABI, provider);
    const quoter = new ethers.Contract(config.uniswapV3QuoterAddress, QUOTER_ABI, provider);

    const [token0, token1, fee] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.fee(),
    ]);

    const isToken0 = token0.toLowerCase() === mintStr.toLowerCase();
    const tokenIn = action === 'buy' ? config.wethAddress : mintStr;
    const tokenOut = action === 'buy' ? mintStr : config.wethAddress;

    const amountIn = ethers.parseUnits(amount.toString(), action === 'buy' ? 18 : await new ethers.Contract(mintStr, ERC20_ABI, provider).decimals());

    const amountOut = await quoter.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, 0);
    const minAmountOut = amountOut * BigInt(Math.floor((1 - slippage / 100) * 1e18)) / BigInt(1e18);

    // Calculate fee
    const feeRate = 0.003; // Example fee rate, adjust as needed
    const feeAmount = amountIn * BigInt(Math.floor(feeRate * 1e18)) / BigInt(1e18);
    const discountedFeeAmount = feeAmount * BigInt(Math.floor((1 - feeDiscount) * 1e18)) / BigInt(1e18);

    // Construct the swap parameters
    const params = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: fee,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
        amountIn: amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0
    };

    console.log('Swap Parameters:', params);
    console.log('Fee Amount:', ethers.formatUnits(discountedFeeAmount, 18));

    return 'Transaction hash would be returned here';
}

async function test() {
    // Example usage for fetchPoolByMints
    const ETH_USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on Ethereum
    const ethTokenInfo = await fetchPoolByMints('eth', ETH_USDC_ADDRESS);
    console.log('Ethereum USDC Pool Info:', JSON.stringify(ethTokenInfo, null, 2));

    const BASE_USDC_ADDRESS = '0xdb6e0e5094A25a052aB6845a9f1e486B9A9B3DdE'; // USDC on Base
    const baseTokenInfo = await fetchPoolByMints('base', BASE_USDC_ADDRESS);
    console.log('Base USDC Pool Info:', JSON.stringify(baseTokenInfo, null, 2));

    // Example usage for swap function (commented out for safety)
    /*
    const privateKey = 'your_private_key_here';
    const slippage = 0.5; // 0.5% slippage
    const feeDiscount = 0.1; // 10% fee discount
    const txHash = await swap('eth', ETH_USDC_ADDRESS, 'buy', 0.1, privateKey, ethTokenInfo, slippage, feeDiscount);
    console.log('Transaction Hash:', txHash);
    */
}

test();