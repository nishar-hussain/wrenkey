import { ethers } from "ethers";
import prisma from "../db.js";

const ENTRYPOINT_V7 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const ENTRYPOINT_ABI = [
  "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)) external view returns (bytes32)",
  "function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] calldata ops, address payable beneficiary) external",
  "function getNonce(address sender, uint192 key) external view returns (uint256)",
];

const FACTORY_ABI = [
  "function createWallet(address owner, bytes32 salt) external returns (address)",
  "function getWalletAddress(address owner, bytes32 salt) external view returns (address)",
];

const WALLET_ABI = [
  "function execute(address to, uint256 value, bytes calldata data) external returns (bytes memory)",
  "function nonce() external view returns (uint256)",
  "function owner() external view returns (address)",
];

export interface UserOperation {
  sender: string;
  nonce: number;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: number;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
}

export interface BuildUserOpParams {
  walletAddress: string;
  to: string;
  value: string;
  data?: string;
  chainId: number;
  paymasterAddress?: string;
  factoryAddress?: string;
  ownerAddress?: string;
  salt?: string;
}

export function encodeAccountGasLimits(verificationGasLimit: number, callGasLimit: number): string {
  const vgl = BigInt(verificationGasLimit);
  const cgl = BigInt(callGasLimit);
  return ethers.toBeHex((vgl << 128n) | cgl, 32);
}

export function encodeGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): string {
  return ethers.toBeHex((maxPriorityFeePerGas << 128n) | maxFeePerGas, 32);
}

export function decodeAccountGasLimits(encoded: string): { verificationGasLimit: bigint; callGasLimit: bigint } {
  const val = BigInt(encoded);
  return {
    verificationGasLimit: val >> 128n,
    callGasLimit: val & ((1n << 128n) - 1n),
  };
}

export function decodeGasFees(encoded: string): { maxPriorityFeePerGas: bigint; maxFeePerGas: bigint } {
  const val = BigInt(encoded);
  return {
    maxPriorityFeePerGas: val >> 128n,
    maxFeePerGas: val & ((1n << 128n) - 1n),
  };
}

export function encodePaymasterAndData(paymasterAddress: string, validUntil: number, validAfter: number, signature?: string): string {
  let data = ethers.solidityPacked(
    ["address", "uint48", "uint48"],
    [paymasterAddress, validUntil, validAfter]
  );
  if (signature) {
    data += signature.slice(2);
  }
  return data;
}

export async function getEntryPoint(rpcUrl: string): Promise<ethers.Contract> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(ENTRYPOINT_V7, ENTRYPOINT_ABI, provider);
}

export async function getWalletNonce(walletAddress: string, rpcUrl: string): Promise<number> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Contract(walletAddress, WALLET_ABI, provider);
  return Number(await wallet.nonce());
}

export async function getEntryPointNonce(walletAddress: string, rpcUrl: string): Promise<number> {
  const entryPoint = await getEntryPoint(rpcUrl);
  return Number(await entryPoint.getNonce(walletAddress, 0n));
}

export async function computeWalletAddress(
  factoryAddress: string,
  owner: string,
  salt: string,
  rpcUrl: string
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  return factory.getWalletAddress(owner, salt);
}

export function encodeInitCode(factoryAddress: string, owner: string, salt: string): string {
  const factoryInterface = new ethers.Interface(FACTORY_ABI);
  return factoryAddress + factoryInterface.encodeFunctionData("createWallet", [owner, salt]).slice(2);
}

export async function buildUserOperation(params: BuildUserOpParams, rpcUrl: string): Promise<UserOperation> {
  const nonce = await getEntryPointNonce(params.walletAddress, rpcUrl);

  let callData: string;
  if (params.data) {
    const walletInterface = new ethers.Interface(WALLET_ABI);
    callData = walletInterface.encodeFunctionData("execute", [params.to, ethers.parseEther(params.value), params.data]);
  } else {
    const walletInterface = new ethers.Interface(WALLET_ABI);
    callData = walletInterface.encodeFunctionData("execute", [params.to, ethers.parseEther(params.value), "0x"]);
  }

  let initCode = "0x";
  if (params.factoryAddress && params.ownerAddress && params.salt) {
    initCode = encodeInitCode(params.factoryAddress, params.ownerAddress, params.salt);
  }

  const verificationGasLimit = 300000;
  const callGasLimit = 200000;
  const preVerificationGas = 50000;

  const accountGasLimits = encodeAccountGasLimits(verificationGasLimit, callGasLimit);
  const gasFees = encodeGasFees(
    ethers.parseUnits("1.5", "gwei"),
    ethers.parseUnits("30", "gwei")
  );

  let paymasterAndData = "0x";
  if (params.paymasterAddress) {
    paymasterAndData = encodePaymasterAndData(params.paymasterAddress, 0, 0);
  }

  return {
    sender: params.walletAddress,
    nonce,
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
    paymasterAndData,
    signature: "0x",
  };
}

export function getUserOpHash(
  userOp: UserOperation,
  entryPointAddress: string,
  chainId: number
): string {
  const packed = ethers.solidityPackedKeccak256(
    [
      "address", "uint256",
      "bytes32", "bytes32",
      "bytes32", "uint256",
      "bytes32", "bytes32",
    ],
    [
      userOp.sender,
      userOp.nonce,
      ethers.keccak256(userOp.initCode),
      ethers.keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      ethers.keccak256(userOp.paymasterAndData),
    ]
  );

  return ethers.solidityPackedKeccak256(
    ["bytes32", "address", "uint256"],
    [packed, entryPointAddress, chainId]
  );
}

export async function estimateUserOpGas(
  userOp: UserOperation,
  entryPointAddress: string,
  rpcUrl: string
): Promise<{
  preVerificationGas: number;
  verificationGasLimit: number;
  callGasLimit: number;
}> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    const gasEstimate = await provider.estimateGas({
      to: entryPointAddress,
      data: ethers.solidityPacked(
        ["bytes"],
        [new ethers.Interface(ENTRYPOINT_ABI).encodeFunctionData("handleOps", [[], ethers.ZeroAddress])]
      ),
    });

    return {
      preVerificationGas: Number(gasEstimate),
      verificationGasLimit: 350000,
      callGasLimit: 150000,
    };
  } catch {
    return {
      preVerificationGas: 60000,
      verificationGasLimit: 350000,
      callGasLimit: 150000,
    };
  }
}
