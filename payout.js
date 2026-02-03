/**
 * THE HANDSHAKE - Payout Logic
 *
 * Handles the execution of payouts on Base network.
 * Supports ETH and USDC.
 * Deducts 2.5% toll fee to the platform wallet.
 *
 * Wallet: 0xC40162bBDE05F7DC002Db97480b814dd79d3b723
 */

const { ethers } = require('ethers');

// Configuration
const TOLL_WALLET = process.env.TOLL_WALLET_ADDRESS || '0xC40162bBDE05F7DC002Db97480b814dd79d3b723';
const TOLL_FEE_PERCENT = parseFloat(process.env.TOLL_FEE_PERCENT) || 2.5;
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// Token Contracts on Base Mainnet
const TOKEN_CONTRACTS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  ETH: null // Native token, no contract needed
};

// Token Decimals
const TOKEN_DECIMALS = {
  ETH: 18,
  USDC: 6 // USDC uses 6 decimals
};

// Minimal ERC-20 ABI for transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

/**
 * Execute payout for a verified escrow
 * Supports both ETH and USDC
 * @param {Object} escrow - The escrow object from database
 * @returns {Object} - Transaction hashes for worker payout and toll fee
 */
async function executePayout(escrow) {
  const currency = escrow.currency || 'ETH';

  // Check if we have a private key for automated payouts
  if (!process.env.PAYOUT_PRIVATE_KEY) {
    console.log('⚠️  No PAYOUT_PRIVATE_KEY set. Returning mock transaction for manual processing.');
    return {
      txHash: `mock_worker_tx_${Date.now()}`,
      tollTxHash: `mock_toll_tx_${Date.now()}`,
      mode: 'MANUAL',
      instructions: {
        workerWallet: escrow.worker_wallet,
        workerAmount: escrow.worker_payout,
        tollWallet: TOLL_WALLET,
        tollAmount: escrow.toll_fee,
        currency: currency,
        tokenContract: TOKEN_CONTRACTS[currency] || null
      }
    };
  }

  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const wallet = new ethers.Wallet(process.env.PAYOUT_PRIVATE_KEY, provider);

    console.log(`📤 Initiating ${currency} payout from: ${wallet.address}`);
    console.log(`   → Worker: ${escrow.worker_wallet} (${escrow.worker_payout} ${currency})`);
    console.log(`   → Toll:   ${TOLL_WALLET} (${escrow.toll_fee} ${currency})`);

    let workerTx, tollTx;

    if (currency === 'ETH') {
      // Native ETH transfer
      const workerAmountWei = ethers.parseEther(escrow.worker_payout.toString());
      const tollAmountWei = ethers.parseEther(escrow.toll_fee.toString());

      workerTx = await wallet.sendTransaction({
        to: escrow.worker_wallet,
        value: workerAmountWei
      });
      console.log(`   ✓ Worker payout tx: ${workerTx.hash}`);
      await workerTx.wait();

      tollTx = await wallet.sendTransaction({
        to: TOLL_WALLET,
        value: tollAmountWei
      });
      console.log(`   ✓ Toll fee tx: ${tollTx.hash}`);
      await tollTx.wait();

    } else if (TOKEN_CONTRACTS[currency]) {
      // ERC-20 token transfer (USDC, etc.)
      const tokenContract = new ethers.Contract(
        TOKEN_CONTRACTS[currency],
        ERC20_ABI,
        wallet
      );

      const decimals = TOKEN_DECIMALS[currency] || 18;
      const workerAmount = ethers.parseUnits(escrow.worker_payout.toString(), decimals);
      const tollAmount = ethers.parseUnits(escrow.toll_fee.toString(), decimals);

      // Transfer to worker
      workerTx = await tokenContract.transfer(escrow.worker_wallet, workerAmount);
      console.log(`   ✓ Worker ${currency} payout tx: ${workerTx.hash}`);
      await workerTx.wait();

      // Transfer toll fee
      tollTx = await tokenContract.transfer(TOLL_WALLET, tollAmount);
      console.log(`   ✓ Toll ${currency} fee tx: ${tollTx.hash}`);
      await tollTx.wait();

    } else {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    return {
      txHash: workerTx.hash,
      tollTxHash: tollTx.hash,
      mode: 'AUTOMATIC',
      currency: currency,
      success: true
    };

  } catch (error) {
    console.error('Payout execution failed:', error);
    throw new Error(`Payout failed: ${error.message}`);
  }
}

/**
 * Calculate payout breakdown
 * @param {number} totalAmount - Total locked amount
 * @param {string} currency - Currency type
 * @returns {Object} - Breakdown of toll fee and worker payout
 */
function calculatePayoutBreakdown(totalAmount, currency = 'ETH') {
  const tollFee = totalAmount * (TOLL_FEE_PERCENT / 100);
  const workerPayout = totalAmount - tollFee;
  const decimals = TOKEN_DECIMALS[currency] || 18;

  return {
    totalAmount,
    currency,
    tollFeePercent: TOLL_FEE_PERCENT,
    tollFee: parseFloat(tollFee.toFixed(decimals > 8 ? 8 : decimals)),
    workerPayout: parseFloat(workerPayout.toFixed(decimals > 8 ? 8 : decimals)),
    tollWallet: TOLL_WALLET,
    tokenContract: TOKEN_CONTRACTS[currency] || null
  };
}

/**
 * Verify wallet address format
 * @param {string} address - Ethereum wallet address
 * @returns {boolean} - Is valid address
 */
function isValidAddress(address) {
  return ethers.isAddress(address);
}

/**
 * Get supported currencies
 * @returns {Array} - List of supported currency codes
 */
function getSupportedCurrencies() {
  return Object.keys(TOKEN_DECIMALS);
}

/**
 * Get token contract address
 * @param {string} currency - Currency code
 * @returns {string|null} - Contract address or null for native ETH
 */
function getTokenContract(currency) {
  return TOKEN_CONTRACTS[currency] || null;
}

/**
 * Get current gas price on Base
 * @returns {Object} - Gas price info
 */
async function getGasPrice() {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const feeData = await provider.getFeeData();

    return {
      gasPrice: ethers.formatUnits(feeData.gasPrice, 'gwei'),
      maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') : null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') : null
    };
  } catch (error) {
    console.error('Failed to get gas price:', error);
    return null;
  }
}

/**
 * Check token balance
 * @param {string} address - Wallet address
 * @param {string} currency - Currency code
 * @returns {string} - Balance as string
 */
async function getBalance(address, currency = 'ETH') {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC);

    if (currency === 'ETH') {
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } else if (TOKEN_CONTRACTS[currency]) {
      const tokenContract = new ethers.Contract(
        TOKEN_CONTRACTS[currency],
        ERC20_ABI,
        provider
      );
      const balance = await tokenContract.balanceOf(address);
      const decimals = TOKEN_DECIMALS[currency] || 18;
      return ethers.formatUnits(balance, decimals);
    }

    return '0';
  } catch (error) {
    console.error('Failed to get balance:', error);
    return '0';
  }
}

module.exports = {
  executePayout,
  calculatePayoutBreakdown,
  isValidAddress,
  getSupportedCurrencies,
  getTokenContract,
  getGasPrice,
  getBalance,
  TOLL_WALLET,
  TOLL_FEE_PERCENT,
  TOKEN_CONTRACTS,
  TOKEN_DECIMALS
};
