// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DlandAnchor
/// @notice Stores the hash of every DLand ledger block on a public EVM chain,
///         so the off-chain ownership history can be independently audited.
contract DlandAnchor {
    address public owner;
    mapping(uint256 => bytes32) public anchors;
    uint256 public latestIndex;

    event BlockAnchored(uint256 indexed index, bytes32 indexed blockHash, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "DlandAnchor: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchor(uint256 index, bytes32 blockHash) external onlyOwner {
        require(anchors[index] == bytes32(0), "DlandAnchor: already anchored");
        anchors[index] = blockHash;
        if (index > latestIndex) latestIndex = index;
        emit BlockAnchored(index, blockHash, block.timestamp);
    }

    function isAnchored(uint256 index, bytes32 blockHash) external view returns (bool) {
        return anchors[index] == blockHash;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "DlandAnchor: zero address");
        owner = newOwner;
    }
}
