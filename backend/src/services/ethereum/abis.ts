/**
 * Contract ABI fragments used for bridge contract queries.
 * Only the function/event signatures needed — no full ABIs.
 */

export const ERC20_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;

/** Circle CCTP TokenMessenger — mint/burn events for cross-chain USDC/EURC */
export const CCTP_TOKEN_MESSENGER_ABI = [
  "event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)",
  "event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken)",
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)",
] as const;

/** Generic bridge lock/unlock events (Wormhole-style) */
export const BRIDGE_ABI = [
  "event TokensLocked(address indexed token, address indexed sender, uint256 amount, bytes32 recipient, uint16 targetChain)",
  "event TokensUnlocked(address indexed token, address indexed recipient, uint256 amount)",
  "function lockedAmount(address token) view returns (uint256)",
  "function isPaused() view returns (bool)",
] as const;
