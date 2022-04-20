// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";


// This is the main building block for smart contracts.
contract xELONToken is ERC20, AccessControl {
    address public stakingAddress;
    
    // Create a new role identifier for the minter role
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /**
     * @dev Constructor that gives minter role all of existing tokens.
     */
    constructor(address _stakingAddress) ERC20("xELON", "XELON") {
        stakingAddress = _stakingAddress;
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
    }
     
    /// @dev Restricted to members of the community.
    modifier onlyMinter() {
        require(isMinter(msg.sender), "Must be minter");
        _;
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        require(msg.sender == stakingAddress, "xElon is non-transferable.");
        super._transfer(sender, recipient, amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual override {
        require(msg.sender == stakingAddress, "xElon is non-transferable.");
        super._approve(owner, spender, amount);
    }
    
    /// @dev Return `true` if the account belongs to the admin role.
    function isMinter(address account) public view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, account) || hasRole(MINTER_ROLE, account);
    }    
    
    function mint(address to, uint256 amount) public onlyMinter {
         _mint(to, amount);
  	}
}
