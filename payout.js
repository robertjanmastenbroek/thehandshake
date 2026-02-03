/**
 * THE HANDSHAKE - Payout Logic
 *
 * Handles the execution of payouts on Base network.
 * Deducts 2.5% toll fee to the platform wallet.
 *
 * Wallet: 0xC40162bBDE05F7DC002Db97480b814dd79d3b723
 */

const { ethers } = require('ethers');

// Configuration
const TOLL_WALLET = process.env.TOLL_WALLET_ADDRESS || '0xC40162bBDE05F7DC002Db97480b814dd79d3b723';
const TOLL_FEE_PERCENT = parseFloat(process.env.TOLL_FEE_PERCENT) || 2.5;
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

/**
 * Execute payout for a verified escrow
 * @param {Object} escrow - The escrow object from database
 * @returns {Object} - Transaction hashes for worker payout and toll fee
 */
async function executePayout(escrow) {
  // Check if we have a private key for automated payouts
  if (!process.env.PAYOUT_PRIVATE_KEY) {
    // Return mock data for manual payouts
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
        currency: escrow.currency
      }
    };
  }

  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const wallet = new ethers.Wallet(process.env.PAYOUT_PRIVATE_KEY, provider);

    console.log(`📤 Initiating payout from: ${wallet.address}`);
    console.log(`   → Worker: ${escrow.worker_wallet} (${escrow.worker_payout} ${escrow.currency})`);
    console.log(`   → Toll:   ${TOLL_WALLET} (${escrow.toll_fee} ${escrow.currency})`);

    // Convert amounts to wei
    const workerAmountWei = ethers.parseEther(escrow.worker_payout.toString());
    const tollAmountWei = ethers.parseEther(escrow.toll_fee.toString());

    // Execute worker payout
    const workerTx = await wallet.sendTransaction({
      to: escrow.worker_wallet,
      value: workerAmountWei
    });
    console.log(`   ✓ Worker payout tx: ${workerTx.hash}`);
    await workerTx.wait();

    // Execute toll fee payment
    const tollTx = await wallet.sendTransaction({
      to: TOLL_WALLET,
      value: tollAmountWei
    });
    console.log(`   ✓ Toll fee tx: ${tollTx.hash}`);
    await tollTx.wait();

    return {
      txHash: workerTx.hash,
      tollTxHash: tollTx.hash,
      mode: 'AUTOMATIC',
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
 * @returns {Object} - Breakdown of toll fee and worker payout
 */
function calculatePayoutBreakdown(totalAmount) {
  const tollFee = totalAmount * (TOLL_FEE_PERCENT / 100);
  const workerPayout = totalAmount - tollFee;

  return {
    totalAmount,
    tollFeePercent: TOLL_FEE_PERCENT,
    tollFee: parseFloat(tollFee.toFixed(8)),
    workerPayout: parseFloat(workerPayout.toFixed(8)),
    tollWallet: TOLL_WALLET
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

module.exports = {
  executePayout,
  calculatePayoutBreakdown,
  isValidAddress,
  getGasPrice,
  TOLL_WALLET,
  TOLL_FEE_PERCENT
};
