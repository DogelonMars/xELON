// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./xELONToken.sol";
import "hardhat/console.sol";

// xELONChef is the master of xELON. He can make xELON and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once xELON is sufficiently
// distributed and the community can show to govern itself.
//

// multisig owner
// minter roll to mint with
// POOLS:
// elon
// elon/weth
// xelon/weth

// Have fun reading it. Hopefully it's bug-free. God bless.
contract xELONChef is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of xELONs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accXelonPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accXelonPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. xELONs to distribute per block.
        uint256 lastRewardBlock; // Last block number that xELONs distribution occurs.
        uint256 accXelonPerShare; // Accumulated xELONs per share, times 1e12. See below.
    }
    // The xELON TOKEN!
    xELONToken public xelon;
    // Dogelon Mars token address
    address public constant DOGELON = 0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3;
    // Block number when bonus xELON period ends.
    uint256 public bonusEndBlock;
    // xELON tokens created per block.
    uint256 public xelonPerBlock;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when xELON mining starts.
    uint256 public startBlock;
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );
    event PoolAdded(address indexed tokenAddress, address indexed addedBy);
    event PoolSet(
        uint256 indexed pid,
        address indexed updater,
        uint256 totalAllocPointsBefore,
        uint256 poolAllocPointsBefore,
        uint256 poolAllocPointsAfter
    );
    event PoolUpdated(
        uint256 indexed pid,
        uint256 multiplier,
        uint256 xelonReward,
        uint256 accXelonPerShareBefore,
        uint256 lpSupply
    );

    constructor(
        uint256 _xelonPerBlock,
        uint256 _startBlock
    ) public {
        xelonPerBlock = _xelonPerBlock;
        startBlock = _startBlock;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function setXelon(address _xelon) external onlyOwner {
        require(_xelon != address(0x0), "Cannot set xElon to the zero address");
        xelon = xELONToken(_xelon);
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
        bool _withUpdate
    ) public onlyOwner nonReentrant {
        require(address(_lpToken) == DOGELON && poolInfo.length == 0, "Can only add Dogelon as a pool once!");
        emit PoolAdded(address(_lpToken), msg.sender);
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock =
            block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint + _allocPoint;
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accXelonPerShare: 0
            })
        );
    }

    // Update the given pool's xELON allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner nonReentrant {
        require(_pid < poolInfo.length, "Specified _pid does not exist");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 poolAllocPoints = poolInfo[_pid].allocPoint;
        emit PoolSet(_pid, msg.sender, totalAllocPoint, poolAllocPoints, _allocPoint);
        totalAllocPoint = totalAllocPoint - poolAllocPoints + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        require(_from < _to, "_from must come before _to");
        require(_from >= startBlock, "_from must come after startBlock");
        return (_to - _from);
    }

    // View function to see pending xELONs on frontend.
    function pendingXelon(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accXelonPerShare = pool.accXelonPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 xelonReward = multiplier * xelonPerBlock * pool.allocPoint / totalAllocPoint;
            accXelonPerShare = accXelonPerShare + (xelonReward * 1e12 / lpSupply);
        }
        return (user.amount * accXelonPerShare - user.rewardDebt) / 1e12;
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            _updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function _updatePool(uint256 _pid) internal {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 xelonReward = multiplier * xelonPerBlock * pool.allocPoint / totalAllocPoint;
        xelon.mint(address(this), xelonReward);
        emit PoolUpdated(_pid, multiplier, xelonReward, pool.accXelonPerShare, lpSupply);
        pool.accXelonPerShare = pool.accXelonPerShare + (xelonReward * 1e12 / lpSupply);
        pool.lastRewardBlock = block.number;
    }

    function updatePool(uint256 _pid) public nonReentrant {
        return _updatePool(_pid);
    }

    // Deposit LP tokens to xELONChef for xELON allocation.
    function deposit(uint256 _pid, uint256 _amount) public nonReentrant {
        require(block.number >= startBlock, "Cannot deposit before startBlock");
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        _updatePool(_pid);
        pool.lpToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        if (user.amount > 0) {
            uint256 pending = (user.amount * pool.accXelonPerShare - user.rewardDebt) / 1e12;
            safeXelonTransfer(msg.sender, pending);
        }
        user.amount = user.amount + _amount;
        user.rewardDebt = user.amount * pool.accXelonPerShare;
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from xELONChef.
    function withdraw(uint256 _pid, uint256 _amount) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        _updatePool(_pid);
        uint256 pending = (user.amount * pool.accXelonPerShare - user.rewardDebt) / 1e12;
        user.amount = user.amount - _amount;
        user.rewardDebt = user.amount * pool.accXelonPerShare;
        safeXelonTransfer(msg.sender, pending);
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 originalAmount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        pool.lpToken.safeTransfer(address(msg.sender), originalAmount);
        emit EmergencyWithdraw(msg.sender, _pid, originalAmount);
    }

    // Safe xelon transfer function, just in case if rounding error causes pool to not have enough xELONs.
    function safeXelonTransfer(address _to, uint256 _amount) internal {
        uint256 xelonBal = xelon.balanceOf(address(this));
        if (_amount > xelonBal) {
            xelon.transfer(_to, xelonBal);
        } else {
            xelon.transfer(_to, _amount);
        }
    }
}
