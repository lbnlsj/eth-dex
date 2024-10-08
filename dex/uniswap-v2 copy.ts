import { ethers } from 'ethers';

const UNISWAP_V2_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const UNISWAP_V2_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

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

async function fetchPoolByMints(mint: string): Promise<TokenInfo> {
    // const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/7be2ffb97c9b420eb72df63176710248');
    const provider = new ethers.JsonRpcProvider('https://base-mainnet.infura.io/v3/b734535321864be3a6e39ea6fd1e915b');
    const factory = new ethers.Contract(UNISWAP_V2_FACTORY_ADDRESS, FACTORY_ABI, provider);
    const token = new ethers.Contract(mint, ERC20_ABI, provider);

    const [symbol, decimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
    ]);

    const pairAddress = await factory.getPair(mint, WETH_ADDRESS);
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
    mintStr: string,
    action: 'buy' | 'sell',
    amount: number,
    privateKey: string,
    info: TokenInfo,
    slippage: number
) {
    const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR-PROJECT-ID');
    const signer = new ethers.Wallet(privateKey, provider);

    const router = new ethers.Contract(UNISWAP_V2_ROUTER_ADDRESS, ROUTER_ABI, signer);

    const path = action === 'buy' ? [WETH_ADDRESS, mintStr] : [mintStr, WETH_ADDRESS];
    const tokenIn = path[0];
    const tokenOut = path[1];

    const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    const amountIn = ethers.parseUnits(amount.toString(), decimals);

    const amounts = await router.getAmountsOut(amountIn, path);
    const amountOutMin = amounts[1] * BigInt(Math.floor((1 - slippage / 100) * 1e18)) / BigInt(1e18);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    // let tx;
    // if (action === 'buy') {
    //     if (tokenIn === WETH_ADDRESS) {
    //         tx = await router.swapExactETHForTokens(
    //             amountOutMin,
    //             path,
    //             signer.address,
    //             deadline,
    //             { value: amountIn }
    //         );
    //     } else {
    //         // Approve router to spend tokens
    //         await tokenContract.connect(signer).approve(UNISWAP_V2_ROUTER_ADDRESS, amountIn);
    //         tx = await router.swapExactTokensForTokens(
    //             amountIn,
    //             amountOutMin,
    //             path,
    //             signer.address,
    //             deadline
    //         );
    //     }
    // } else { // sell
    //     if (tokenOut === WETH_ADDRESS) {
    //         // Approve router to spend tokens
    //         await tokenContract.connect(signer).approve(UNISWAP_V2_ROUTER_ADDRESS, amountIn);
    //         tx = await router.swapExactTokensForETH(
    //             amountIn,
    //             amountOutMin,
    //             path,
    //             signer.address,
    //             deadline
    //         );
    //     } else {
    //         // Approve router to spend tokens
    //         await tokenContract.connect(signer).approve(UNISWAP_V2_ROUTER_ADDRESS, amountIn);
    //         tx = await router.swapExactTokensForTokens(
    //             amountIn,
    //             amountOutMin,
    //             path,
    //             signer.address,
    //             deadline
    //         );
    //     }
    // }

    // const receipt = await tx.wait();
    // return receipt.transactionHash;
}

// Test function
async function test() {
    // Example usage for fetchPoolByMints
    // uniswap eth 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
    const UNI_ADDRESS = '0xdb6e0e5094A25a052aB6845a9f1e486B9A9B3DdE';
    const tokenInfo = await fetchPoolByMints(UNI_ADDRESS);
    console.log(JSON.stringify(tokenInfo, null, 2));

    // Example usage for swap function
    // Note: This is commented out as it requires a private key and would actually submit a transaction
    /*
    const privateKey = 'your_private_key_here';
    const slippage = 0.5; // 0.5% slippage
    const txHash = await swap(UNI_ADDRESS, 'buy', 0.1, privateKey, tokenInfo, slippage);
    console.log('Transaction Hash:', txHash);
    */
}

test();