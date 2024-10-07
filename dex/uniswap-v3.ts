import { ethers } from 'ethers';

const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const UNISWAP_V3_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

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

async function fetchPoolByMints(mint: string): Promise<TokenInfo> {
    const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/7be2ffb97c9b420eb72df63176710248');
    const factory = new ethers.Contract(UNISWAP_V3_FACTORY_ADDRESS, FACTORY_ABI, provider);
    const token = new ethers.Contract(mint, ERC20_ABI, provider);

    const [symbol, decimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
    ]);

    const poolAddress = await factory.getPool(mint, WETH_ADDRESS, 3000); // Assuming 0.3% fee tier
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

    const [token0, token1, liquidity, slot0] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.liquidity(),
        pool.slot0(),
    ]);

    const isToken0 = token0.toLowerCase() === mint.toLowerCase();
    const sqrtPriceX96 = slot0[0];
    const price = isToken0
        ? (Number(sqrtPriceX96) / (2 ** 96)) ** 2
        : 1 / ((Number(sqrtPriceX96) / (2 ** 96)) ** 2);

    const tokenContract = new ethers.Contract(mint, ERC20_ABI, provider);
    const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);

    const [tokenBalance, wethBalance] = await Promise.all([
        tokenContract.balanceOf(poolAddress),
        wethContract.balanceOf(poolAddress),
    ]);

    const tokenLiquidity = Number(ethers.formatUnits(tokenBalance, decimals));
    const ethLiquidity = Number(ethers.formatUnits(wethBalance, 18));
    const marketValue = ethLiquidity * 2; // Approximation, assuming equal value on both sides

    // const poolCreationBlock = await provider.getTransactionReceipt(poolAddress);
    // const poolCreationTime = (await provider.getBlock(poolCreationBlock!.blockNumber!))!.timestamp;

    // Note: vol24h is not available from on-chain data, you might need to use an API for this
    const vol24h = 0;

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
            // creationTime: new Date(Number(poolCreationTime) * 1000).toISOString(),
        },
    };
}

async function swap(
    mintStr: string,
    action: 'buy' | 'sell',
    amount: number,
    privateKey: string,
    info: TokenInfo,
    slippage: number,
    feeDiscount: number = 0 // New parameter for fee discount
) {
    const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR-PROJECT-ID');
    const signer = new ethers.Wallet(privateKey, provider);

    const pool = new ethers.Contract(info.id, POOL_ABI, provider);
    const quoter = new ethers.Contract(UNISWAP_V3_QUOTER_ADDRESS, QUOTER_ABI, provider);

    const [token0, token1, fee] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.fee(),
    ]);

    const isToken0 = token0.toLowerCase() === mintStr.toLowerCase();
    const tokenIn = action === 'buy' ? WETH_ADDRESS : mintStr;
    const tokenOut = action === 'buy' ? mintStr : WETH_ADDRESS;

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

    // Note: This is a simplified version. In a real implementation, you would need to:
    // 1. Approve the router to spend your tokens (if selling a token other than ETH)
    // 2. Use the actual Uniswap V3 Router contract to perform the swap
    // 3. Handle the case of swapping ETH (wrapping/unwrapping)

    // For demonstration purposes, we'll just log the parameters
    console.log('Swap Parameters:', params);
    console.log('Fee Amount:', ethers.formatUnits(discountedFeeAmount, 18));

    // In a real implementation, you would send the transaction here
    // const tx = await routerContract.exactInputSingle(params, { value: action === 'buy' ? amountIn + discountedFeeAmount : 0 });
    // const receipt = await tx.wait();
    // return receipt.transactionHash;

    return 'Transaction hash would be returned here';
}

// Test function
async function test() {
    // Example usage for fetchPoolByMints
    const UNI_ADDRESS = '0xD0EbFe04Adb5Ef449Ec5874e450810501DC53ED5';
    const tokenInfo = await fetchPoolByMints(UNI_ADDRESS);
    console.log(JSON.stringify(tokenInfo, null, 2));

    // Example usage for swap function
    // Note: This is commented out as it requires a private key and would actually submit a transaction
    /*
    const privateKey = 'your_private_key_here';
    const slippage = 0.5; // 0.5% slippage
    const feeDiscount = 0.1; // 10% fee discount
    const txHash = await swap(UNI_ADDRESS, 'buy', 0.1, privateKey, tokenInfo, slippage, feeDiscount);
    console.log('Transaction Hash:', txHash);
    */
}

test();