// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) public ERC20(name, symbol) {
        _mint(msg.sender, supply);
    }

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }

    function setBalance(address addr, uint256 amount) public {
        uint256 currentBalance = balanceOf(addr);
        if (amount == currentBalance) {
            return;
        } else if (amount > currentBalance) {
            _mint(addr, amount - currentBalance);
            return;
        } else if (amount < currentBalance) {
            _burn(addr, currentBalance - amount);
            return;
        }
    }
}