import { Program, web3 } from '@project-serum/anchor';
import * as anchor from '@project-serum/anchor';
import {
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID, AccountLayout, MintLayout, ASSOCIATED_TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";

import fs from 'fs';
import { GlobalPool, RafflePool } from './types';
import { publicKey } from '@project-serum/anchor/dist/cjs/utils';
import { Raffle } from '../target/types/raffle';

const GLOBAL_AUTHORITY_SEED = "global-authority";

const PROGRAM_ID = "DfpiHaschjki2b4wCwVkNSPsh9L4wvC9h15eJRPVaHh8";
const BOOGA_TOKEN_MINT = new PublicKey("AsACVnuMa5jpmfp3BjArmb2qWg5A6HBkuXePwT37RrLY");
const RAFFLE_SIZE = 162136;
const DECIMALS = 1000000000;
const BOOGA_DECIMALS = 100;

anchor.setProvider(anchor.Provider.local(web3.clusterApiUrl('devnet')));
const solConnection = anchor.getProvider().connection;
const payer = anchor.getProvider().wallet;
console.log(payer.publicKey.toBase58());

const idl = JSON.parse(
    fs.readFileSync(__dirname + "/raffle.json", "utf8")
);

let program: Program = null;

// Address of the deployed program.
const programId = new anchor.web3.PublicKey(PROGRAM_ID);

// Generate the program client from IDL.
program = new anchor.Program(idl, programId);
console.log('ProgramId: ', program.programId.toBase58());

const main = async () => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    console.log('GlobalAuthority: ', globalAuthority.toBase58());

    // await initProject();
    // await createRaffle(payer.publicKey, new PublicKey("HyomvqtLBjHhPty1P6dKzNf5gNow9qbfGkxj69pqBD8Z"), 1, 0, 1649355000, 10, 1, 100);
    // await updateRafflePeriod(payer.publicKey, new PublicKey("HyomvqtLBjHhPty1P6dKzNf5gNow9qbfGkxj69pqBD8Z"), 1649355012);
    // await buyTicket(payer.publicKey, new PublicKey("14njy5aKYoAvz3Ut8ojfYULhEKbBDXcXidZ3xK6jZs7U"), 10);
    // await revealWinner(payer.publicKey, new PublicKey("14njy5aKYoAvz3Ut8ojfYULhEKbBDXcXidZ3xK6jZs7U"));
    // await claimReward(payer.publicKey, new PublicKey("14njy5aKYoAvz3Ut8ojfYULhEKbBDXcXidZ3xK6jZs7U"));
    await withdrawNft(payer.publicKey, new PublicKey("HyomvqtLBjHhPty1P6dKzNf5gNow9qbfGkxj69pqBD8Z"));

    const pool = await getRaffleState(new PublicKey("HyomvqtLBjHhPty1P6dKzNf5gNow9qbfGkxj69pqBD8Z"));
    console.log(pool.endTimestamp.toNumber());
}

/**
 * @dev Initialize the project - exactly the init account
 * @returns Init accounts for this project
 */
export const initProject = async () => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    const tx = await program.rpc.initialize(
        bump, {
        accounts: {
            admin: payer.publicKey,
            globalAuthority,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        },
        instructions: [],
        signers: [],
    });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);
    return true;
}

export const createRaffle = async (
    userAddress: PublicKey,
    nft_mint: PublicKey,
    ticketPriceSol: number,
    ticketPriceSpl: number,
    endTimestamp: number,
    winnerCount: number,
    whitelisted: number,
    max: number
) => {

    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    let raffle = await PublicKey.createWithSeed(
        userAddress,
        nft_mint.toBase58().slice(0, 10),
        program.programId,
    );

    let ix = SystemProgram.createAccountWithSeed({
        fromPubkey: userAddress,
        basePubkey: userAddress,
        seed: nft_mint.toBase58().slice(0, 10),
        newAccountPubkey: raffle,
        lamports: await solConnection.getMinimumBalanceForRentExemption(RAFFLE_SIZE),
        space: RAFFLE_SIZE,
        programId: program.programId,
    });

    let ownerNftAccount = await getAssociatedTokenAccount(userAddress, nft_mint);

    let ix0 = await getATokenAccountsNeedCreate(
        solConnection,
        userAddress,
        globalAuthority,
        [nft_mint]
    );
    console.log("Dest NFT Account = ", ix0.destinationAccounts[0].toBase58());


    let ix1 = await getATokenAccountsNeedCreate(
        solConnection,
        userAddress,
        userAddress,
        [BOOGA_TOKEN_MINT]
    );
    const tx = await program.rpc.createRaffle(
        bump,
        new anchor.BN(ticketPriceSol * DECIMALS),
        new anchor.BN(ticketPriceSpl * BOOGA_DECIMALS),
        new anchor.BN(endTimestamp),
        new anchor.BN(winnerCount),
        new anchor.BN(whitelisted),
        new anchor.BN(max),
        {
            accounts: {
                admin: payer.publicKey,
                globalAuthority,
                raffle,
                ownerTempNftAccount: ownerNftAccount,
                destNftTokenAccount: ix0.destinationAccounts[0],
                nftMintAddress: nft_mint,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            instructions: [
                ix,
                ...ix0.instructions,
                ...ix1.instructions
            ],
            signers: [],
        });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);

}

export const updateRafflePeriod = async (
    userAddress: PublicKey,
    nft_mint: PublicKey,
    endTimestamp: number
) => {
    const raffleKey = await getRaffleKey(nft_mint);
    const tx = await program.rpc.updateRafflePeriod(
        new anchor.BN(endTimestamp), {
        accounts: {
            admin: userAddress,
            raffle: raffleKey,
        },
        instructions: [],
        signers: [],
    });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);
}

export const buyTicket = async (
    userAddress: PublicKey,
    nft_mint: PublicKey,
    amount: number
) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    const raffleKey = await getRaffleKey(nft_mint);
    console.log(raffleKey)
    let raffleState = await getRaffleState(nft_mint);
    console.log(raffleState);

    const creator = raffleState.creator;
    // let totalAmountSpl = amount * raffleState.ticketPriceSpl;
    // const userFlwr = await getTokenAccountBalance()
    // if (totalAmountSpl < )

    let userTokenAccount = await getAssociatedTokenAccount(userAddress, BOOGA_TOKEN_MINT);
    let creatorTokenAccount = await getAssociatedTokenAccount(creator, BOOGA_TOKEN_MINT);

    const tx = await program.rpc.buyTickets(
        bump,
        new anchor.BN(amount),
        {
            accounts: {
                buyer: userAddress,
                raffle: raffleKey,
                globalAuthority,
                creator,
                creatorTokenAccount,
                userTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            },
            instructions: [],
            signers: [],
        });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);

}

export const revealWinner = async (
    userAddress: PublicKey,
    nft_mint: PublicKey,
) => {
    const raffleKey = await getRaffleKey(nft_mint);
    const tx = await program.rpc.revealWinner(
        {
            accounts: {
                buyer: userAddress,
                raffle: raffleKey,
            },
            instructions: [],
            signers: [],
        });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);
}

export const claimReward = async (
    userAddress: PublicKey,
    nft_mint: PublicKey,
) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    const raffleKey = await getRaffleKey(nft_mint);
    const srcNftTokenAccount = await getAssociatedTokenAccount(globalAuthority, nft_mint);

    let ix0 = await getATokenAccountsNeedCreate(
        solConnection,
        userAddress,
        userAddress,
        [nft_mint]
    );
    console.log("Claimer's NFT Account: ", ix0.destinationAccounts[0]);

    const tx = await program.rpc.claimReward(
        bump,
        {
            accounts: {
                claimer: userAddress,
                globalAuthority,
                raffle: raffleKey,
                claimerNftTokenAccount: ix0.destinationAccounts[0],
                srcNftTokenAccount,
                nftMintAddress: nft_mint,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            instructions: [
                ...ix0.instructions
            ],
            signers: [],
        });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);

}

export const withdrawNft = async (
    userAddress: PublicKey,
    nft_mint: PublicKey,
) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    const raffleKey = await getRaffleKey(nft_mint);
    const srcNftTokenAccount = await getAssociatedTokenAccount(globalAuthority, nft_mint);

    let ix0 = await getATokenAccountsNeedCreate(
        solConnection,
        userAddress,
        userAddress,
        [nft_mint]
    );
    console.log("Creator's NFT Account: ", ix0.destinationAccounts[0]);

    const tx = await program.rpc.withdrawNft(
        bump,
        {
            accounts: {
                claimer: userAddress,
                globalAuthority,
                raffle: raffleKey,
                claimerNftTokenAccount: ix0.destinationAccounts[0],
                srcNftTokenAccount,
                nftMintAddress: nft_mint,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            instructions: [
                ...ix0.instructions
            ],
            signers: [],
        });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);

}

export const getRaffleKey = async (
    nft_mint: PublicKey
): Promise<PublicKey | null> => {
    let poolAccounts = await solConnection.getParsedProgramAccounts(
        program.programId,
        {
            filters: [
                {
                    dataSize: RAFFLE_SIZE
                },
                {
                    memcmp: {
                        "offset": 40,
                        "bytes": nft_mint.toBase58()
                    }
                }
            ]
        }
    );
    console.log(poolAccounts);
    if (poolAccounts.length !== 0) {
        let raffleKey = poolAccounts[0].pubkey;
        return raffleKey;
    } else {
        return null;
    }
}

export const getRaffleState = async (
    nft_mint: PublicKey
): Promise<RafflePool | null> => {

    let poolAccounts = await solConnection.getParsedProgramAccounts(
        program.programId,
        {
            filters: [
                {
                    dataSize: RAFFLE_SIZE
                },
                {
                    memcmp: {
                        "offset": 40,
                        "bytes": nft_mint.toBase58()
                    }
                }
            ]
        }
    );
    if (poolAccounts.length !== 0) {
        console.log(poolAccounts[0].pubkey.toBase58());
        let rentalKey = poolAccounts[0].pubkey;

        try {
            let rentalState = await program.account.rafflePool.fetch(rentalKey);
            return rentalState as RafflePool;
        } catch {
            return null;
        }
    } else {
        return null;
    }
}

const getAssociatedTokenAccount = async (ownerPubkey: PublicKey, mintPk: PublicKey): Promise<PublicKey> => {
    let associatedTokenAccountPubkey = (await PublicKey.findProgramAddress(
        [
            ownerPubkey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            mintPk.toBuffer(), // mint address
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    ))[0];
    return associatedTokenAccountPubkey;
}

export const getATokenAccountsNeedCreate = async (
    connection: anchor.web3.Connection,
    walletAddress: anchor.web3.PublicKey,
    owner: anchor.web3.PublicKey,
    nfts: anchor.web3.PublicKey[],
) => {
    let instructions = [], destinationAccounts = [];
    for (const mint of nfts) {
        const destinationPubkey = await getAssociatedTokenAccount(owner, mint);
        let response = await connection.getAccountInfo(destinationPubkey);
        if (!response) {
            const createATAIx = createAssociatedTokenAccountInstruction(
                destinationPubkey,
                walletAddress,
                owner,
                mint,
            );
            instructions.push(createATAIx);
        }
        destinationAccounts.push(destinationPubkey);
        if (walletAddress != owner) {
            const userAccount = await getAssociatedTokenAccount(walletAddress, mint);
            response = await connection.getAccountInfo(userAccount);
            if (!response) {
                const createATAIx = createAssociatedTokenAccountInstruction(
                    userAccount,
                    walletAddress,
                    walletAddress,
                    mint,
                );
                instructions.push(createATAIx);
            }
        }
    }
    return {
        instructions,
        destinationAccounts,
    };
}

export const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress: anchor.web3.PublicKey,
    payer: anchor.web3.PublicKey,
    walletAddress: anchor.web3.PublicKey,
    splTokenMintAddress: anchor.web3.PublicKey
) => {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
        { pubkey: walletAddress, isSigner: false, isWritable: false },
        { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
        {
            pubkey: anchor.web3.SystemProgram.programId,
            isSigner: false,
            isWritable: false,
        },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
            pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false,
        },
    ];
    return new anchor.web3.TransactionInstruction({
        keys,
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.from([]),
    });
}

main()