// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FileRegistry
 * @notice Stores immutable mapping of content hashes/magnet URIs to owners and metadata.
 */
contract FileRegistry {
    struct FileMeta {
        address owner;
        string name;
        string magnetURI; // webtorrent magnet URI
        bytes32 contentHash; // optional additional hash
        uint256 registeredAt;
    }

    // fileId => metadata. fileId is keccak256(name, magnetURI, owner)
    mapping(bytes32 => FileMeta) private files;

    event FileRegistered(bytes32 indexed fileId, address indexed owner, string name, string magnetURI, bytes32 contentHash);

    function computeFileId(address owner, string memory name, string memory magnetURI) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, name, magnetURI));
    }

    function registerFile(string calldata name, string calldata magnetURI, bytes32 contentHash) external returns (bytes32 fileId) {
        require(bytes(name).length > 0, "name required");
        require(bytes(magnetURI).length > 0, "magnet required");
        fileId = computeFileId(msg.sender, name, magnetURI);
        require(files[fileId].owner == address(0), "already registered");

        files[fileId] = FileMeta({
            owner: msg.sender,
            name: name,
            magnetURI: magnetURI,
            contentHash: contentHash,
            registeredAt: block.timestamp
        });

        emit FileRegistered(fileId, msg.sender, name, magnetURI, contentHash);
    }

    function getFile(bytes32 fileId) external view returns (FileMeta memory) {
        require(files[fileId].owner != address(0), "not found");
        return files[fileId];
    }

    function getByParams(address owner, string calldata name, string calldata magnetURI) external view returns (FileMeta memory) {
        bytes32 fileId = computeFileId(owner, name, magnetURI);
        require(files[fileId].owner != address(0), "not found");
        return files[fileId];
    }
}


