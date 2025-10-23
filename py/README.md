# Python EIP712 Signature Testing

This directory contains Python implementations for testing EIP712 signatures used in the OptionVault system.

## Files

- `eip712_signature_test.py` - Main script that reproduces the static EIP712 test from JavaScript/TypeScript
- `requirements.txt` - Python dependencies
- `README.md` - This file

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Run the signature test:
```bash
python eip712_signature_test.py
```

## Purpose

This Python implementation serves as a cross-verification tool to ensure that EIP712 signatures generated in Python match exactly with those generated in JavaScript/TypeScript (Ethers.js). This is useful for:

- Cross-platform compatibility testing
- External script integration
- Signature verification in different environments
- Debugging signature generation issues

## Expected Output

The script should output:
- Domain, types, and values used for EIP712 signing
- Computed message hash
- Generated signature
- Signature verification results
- Comparison with expected JavaScript test values

If everything matches, you should see "✅ SUCCESS: Python implementation matches JavaScript test exactly!"
