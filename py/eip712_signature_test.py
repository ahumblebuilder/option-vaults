#!/usr/bin/env python3
"""
EIP712 Signature Test for OptionVault
Reproduces the same static test from JavaScript/TypeScript to verify cross-platform compatibility
"""

import json
from eth_account import Account
from eth_utils import keccak
from eth_abi import encode

def main():
    print("=== PYTHON EIP712 SIGNATURE TEST ===")
    print("Reproducing static test from JavaScript/TypeScript")
    print()
    
    # Static values from the JavaScript test
    domain = {
        "name": "OptionVault",
        "version": "1",
        "chainId": 31337,
        "verifyingContract": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
    }
    
    types = {
        "WriteOption": [
            {"name": "strike", "type": "uint256"},
            {"name": "expiry", "type": "uint256"},
            {"name": "premiumPerUnit", "type": "uint256"},
            {"name": "minDeposit", "type": "uint256"},
            {"name": "maxDeposit", "type": "uint256"},
            {"name": "validUntil", "type": "uint256"},
            {"name": "quoteId", "type": "uint256"}
        ]
    }
    
    value = {
        "strike": 4200000000,  # 4200 USDC (6 decimals)
        "expiry": 1735689600,  # 2025-01-01 00:00:00 UTC
        "premiumPerUnit": 150000000,  # 150 USDC (6 decimals)
        "minDeposit": 1000000000000000000,  # 1 WETH (18 decimals)
        "maxDeposit": 10000000000000000000,  # 10 WETH (18 decimals)
        "validUntil": 1735689600,  # 2025-01-01 00:00:00 UTC
        "quoteId": 1
    }
    
    # Private key from the JavaScript test (Hardhat account #1)
    private_key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    expected_signer = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    
    print("=== STATIC EIP712 TEST VALUES ===")
    print("Domain:")
    print(json.dumps(domain, indent=2))
    print()
    print("Types:")
    print(json.dumps(types, indent=2))
    print()
    print("Value:")
    print(json.dumps(value, indent=2))
    print()
    
    # Create account from private key
    account = Account.from_key(private_key)
    print(f"Signer address: {account.address}")
    print(f"Expected signer: {expected_signer}")
    print(f"Signer match: {account.address.lower() == expected_signer.lower()}")
    print()
    
    # Manual EIP712 encoding
    print("=== MANUAL EIP712 ENCODING ===")
    
    # Domain separator
    domain_separator = keccak(encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
            keccak(b'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
            keccak(b'OptionVault'),
            keccak(b'1'),
            31337,
            '0x5FbDB2315678afecb367f032d93F642f64180aa3'  # Address as string
        ]
    ))
    
    # WriteOption struct hash - need to include the type hash
    write_option_type_hash = keccak(b'WriteOption(uint256 strike,uint256 expiry,uint256 premiumPerUnit,uint256 minDeposit,uint256 maxDeposit,uint256 validUntil,uint256 quoteId)')
    
    # Encode the struct data
    struct_data = encode(
        ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
        [
            value['strike'],
            value['expiry'], 
            value['premiumPerUnit'],
            value['minDeposit'],
            value['maxDeposit'],
            value['validUntil'],
            value['quoteId']
        ]
    )
    
    # Combine type hash with data
    struct_hash = keccak(write_option_type_hash + struct_data)
    
    # Final message hash
    message_hash = keccak(b'\x19\x01' + domain_separator + struct_hash)
    
    print("=== HASH COMPUTATION ===")
    print(f"Domain separator: {domain_separator.hex()}")
    print(f"Struct hash: {struct_hash.hex()}")
    print(f"Message hash: {message_hash.hex()}")
    print()
    
    # Sign the message using the correct method
    signature = account.unsafe_sign_hash(message_hash)
    signature_hex = signature.signature.hex()
    print(f"Python signature: {signature_hex}")
    print()
    
    # Verify the signature
    recovered_address = Account._recover_hash(message_hash, signature=signature.signature)
    print("=== SIGNATURE VERIFICATION ===")
    print(f"Recovered address: {recovered_address}")
    print(f"Expected address: {expected_signer}")
    print(f"Recovery match: {recovered_address.lower() == expected_signer.lower()}")
    print()
    
    # Cross-check values for external scripts
    print("=== CROSS-CHECK VALUES FOR EXTERNAL SCRIPTS ===")
    print(f"Domain Separator (EIP712): {domain_separator.hex()}")
    print(f"Struct Hash (WriteOption): {struct_hash.hex()}")
    print(f"Message Hash: {message_hash.hex()}")
    print(f"Signer Private Key (for testing): {private_key}")
    print(f"Signer Address: {expected_signer}")
    print()
    
    # Expected values from JavaScript test (for comparison)
    expected_hash = "a093d151c7dbd0564ba51e99baa52e7ac611e0b709837063543bc73fdc76b98e"
    expected_signature = "3b74cdaac8dbb1cdbcefea7b9fb5cc008fadff0b7263530bbeef321f2b7f51c41df6a318c611087d5393e9e86d5bfa006499c713b4a36c8f9632400f476a88861c"
    
    print("=== COMPARISON WITH JAVASCRIPT TEST ===")
    print(f"Hash match: {message_hash.hex() == expected_hash}")
    print(f"Signature match: {signature_hex == expected_signature}")
    print()
    
    if message_hash.hex() == expected_hash and signature_hex == expected_signature:
        print("✅ SUCCESS: Python implementation matches JavaScript test exactly!")
    else:
        print("❌ MISMATCH: Python implementation differs from JavaScript test")
        print(f"Expected hash: {expected_hash}")
        print(f"Got hash: {message_hash.hex()}")
        print(f"Expected signature: {expected_signature}")
        print(f"Got signature: {signature_hex}")

if __name__ == "__main__":
    main()