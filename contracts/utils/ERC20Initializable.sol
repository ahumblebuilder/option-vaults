// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract ERC20Initializable is ERC20, Initializable {
    bool private _initialized;
    uint8 private _decimals;
    string private _name;
    string private _symbol;

    error AlreadyInitialized();

    constructor() ERC20("", "") {
        _disableInitializers();
    }

    function _initializeERC20(string memory __name, string memory __symbol, uint8 __decimals) internal {
        if (_initialized) {
            revert AlreadyInitialized();
        }
        _initialized = true;
        _name = __name;
        _symbol = __symbol;
        _decimals = __decimals;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
}
