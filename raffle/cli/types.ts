import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';

export interface GlobalPool {
    superAdmin: PublicKey,
}

export interface RafflePool {
    creator: PublicKey,
    nftMint: PublicKey,
    count: anchor.BN,
    winnerCount: anchor.BN,
    noRepeat: anchor.BN,
    maxEntrants: anchor.BN,
    startTimestamp: anchor.BN,
    endTimestamp: anchor.BN,
    ticketPriceBooga: anchor.BN,
    ticketPriceZion: anchor.BN,
    ticketPriceSol: anchor.BN,
    whitelisted: anchor.BN,
    claimedWinner: anchor.BN[],
    indexes: anchor.BN[],
    winner: PublicKey[],
    entrants: PublicKey[],
}