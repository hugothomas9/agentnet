import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import { Agentnet } from "../target/types/agentnet";

// ─── Constantes ────────────────────────────────────────────────────────────────

const TREASURY = new PublicKey("9YkhYGQphEspcR2Pftw55174ybkpQFQmo24T72AQK2QX");
const MIN_STAKE = new BN(50_000_000); // 0.05 SOL

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAgentPDA(program: Program<Agentnet>, agentWallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), agentWallet.toBuffer()],
    program.programId
  );
  return pda;
}

function getReputationPDA(program: Program<Agentnet>, agentWallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agentWallet.toBuffer()],
    program.programId
  );
  return pda;
}

function getStakeVaultPDA(program: Program<Agentnet>, agentWallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), agentWallet.toBuffer()],
    program.programId
  );
  return pda;
}

function getOwnerRegistryPDA(program: Program<Agentnet>, owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("owner"), owner.toBuffer()],
    program.programId
  );
  return pda;
}

function getEscrowPDA(
  program: Program<Agentnet>,
  requester: PublicKey,
  executor: PublicKey,
  taskId: string
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      requester.toBuffer(),
      executor.toBuffer(),
      Buffer.from(taskId),
    ],
    program.programId
  );
  return pda;
}

function getInteractionPairPDA(
  program: Program<Agentnet>,
  walletA: PublicKey,
  walletB: PublicKey
): PublicKey {
  // Ordonner lexicographiquement
  const [a, b] =
    walletA.toBuffer().compare(walletB.toBuffer()) < 0
      ? [walletA, walletB]
      : [walletB, walletA];
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pair"), a.toBuffer(), b.toBuffer()],
    program.programId
  );
  return pda;
}

/** Airdrop et confirmation */
async function airdrop(
  provider: anchor.AnchorProvider,
  to: PublicKey,
  sol: number
) {
  const sig = await provider.connection.requestAirdrop(
    to,
    sol * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig, "confirmed");
}

/** Enregistre un agent (helper réutilisable) */
async function registerAgent(
  program: Program<Agentnet>,
  owner: Keypair,
  agentWallet: Keypair,
  nftMint: Keypair,
  opts?: { name?: string; stakeAmount?: BN; capabilities?: string[] }
) {
  const name = opts?.name || "TestAgent";
  const stakeAmount = opts?.stakeAmount || MIN_STAKE;
  const capabilities = opts?.capabilities || ["research"];

  await program.methods
    .registerAgent({
      name,
      version: "1.0.0",
      capabilities,
      endpoint: "https://test.example.com",
      stakeAmount,
    })
    .accounts({
      owner: owner.publicKey,
      nftMint: nftMint.publicKey,
      agentWallet: agentWallet.publicKey,
      agent: getAgentPDA(program, agentWallet.publicKey),
      reputation: getReputationPDA(program, agentWallet.publicKey),
      stakeVault: getStakeVaultPDA(program, agentWallet.publicKey),
      ownerRegistry: getOwnerRegistryPDA(program, owner.publicKey),
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
    .rpc();
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AgentNet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.agentnet as Program<Agentnet>;

  // Keypairs réutilisables
  let owner: Keypair;
  let agentWalletA: Keypair;
  let agentWalletB: Keypair;
  let nftMintA: Keypair;
  let nftMintB: Keypair;

  before(async () => {
    owner = Keypair.generate();
    agentWalletA = Keypair.generate();
    agentWalletB = Keypair.generate();
    nftMintA = Keypair.generate();
    nftMintB = Keypair.generate();

    // Fund le owner
    await airdrop(provider, owner.publicKey, 10);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. REGISTER AGENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("register_agent", () => {
    it("enregistre un agent avec succes", async () => {
      await registerAgent(program, owner, agentWalletA, nftMintA, {
        name: "ResearchBot",
        capabilities: ["research", "analysis"],
      });

      const agentPda = getAgentPDA(program, agentWalletA.publicKey);
      const agent = await program.account.agent.fetch(agentPda);

      expect(agent.name).to.equal("ResearchBot");
      expect(agent.version).to.equal("1.0.0");
      expect(agent.capabilities).to.deep.equal(["research", "analysis"]);
      expect(agent.endpoint).to.equal("https://test.example.com");
      expect(agent.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(agent.agentWallet.toBase58()).to.equal(agentWalletA.publicKey.toBase58());
      expect(agent.nftMint.toBase58()).to.equal(nftMintA.publicKey.toBase58());
      expect(agent.status).to.deep.equal({ active: {} });
    });

    it("initialise la reputation a zero", async () => {
      const repPda = getReputationPDA(program, agentWalletA.publicKey);
      const rep = await program.account.reputation.fetch(repPda);

      expect(rep.agent.toBase58()).to.equal(agentWalletA.publicKey.toBase58());
      expect(rep.tasksReceived.toNumber()).to.equal(0);
      expect(rep.tasksCompleted.toNumber()).to.equal(0);
      expect(rep.contestsReceived.toNumber()).to.equal(0);
      expect(rep.uniqueRequesters.toNumber()).to.equal(0);
      expect(rep.tasksDelegated.toNumber()).to.equal(0);
      expect(rep.contestsEmitted.toNumber()).to.equal(0);
      expect(rep.score.toNumber()).to.equal(0);
    });

    it("cree le stake vault avec le bon montant", async () => {
      const vaultPda = getStakeVaultPDA(program, agentWalletA.publicKey);
      const vault = await program.account.stakeVault.fetch(vaultPda);

      expect(vault.agentWallet.toBase58()).to.equal(agentWalletA.publicKey.toBase58());
      expect(vault.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(vault.stakeAmount.toNumber()).to.equal(MIN_STAKE.toNumber());
    });

    it("incremente le compteur d'agents de l'owner", async () => {
      const registryPda = getOwnerRegistryPDA(program, owner.publicKey);
      const registry = await program.account.ownerRegistry.fetch(registryPda);

      expect(registry.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(registry.agentCount).to.equal(1);
    });

    it("enregistre un deuxieme agent et incremente le compteur", async () => {
      await registerAgent(program, owner, agentWalletB, nftMintB, {
        name: "TranslatorBot",
        capabilities: ["translation"],
      });

      const registryPda = getOwnerRegistryPDA(program, owner.publicKey);
      const registry = await program.account.ownerRegistry.fetch(registryPda);
      expect(registry.agentCount).to.equal(2);
    });

    it("refuse un stake insuffisant", async () => {
      const wallet = Keypair.generate();
      const mint = Keypair.generate();

      try {
        await registerAgent(program, owner, wallet, mint, {
          stakeAmount: new BN(1_000_000), // 0.001 SOL < 0.05 SOL
        });
        expect.fail("Devrait echouer avec InsufficientStake");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.message).to.include(
          "InsufficientStake"
        );
      }
    });

    it("refuse d'enregistrer le meme agent_wallet deux fois", async () => {
      const mint = Keypair.generate();

      try {
        await registerAgent(program, owner, agentWalletA, mint);
        expect.fail("Devrait echouer (PDA deja initialise)");
      } catch (err: any) {
        // PDA init echoue car le compte existe deja
        expect(err.toString()).to.include("already in use");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. UPDATE AGENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("update_agent", () => {
    it("met a jour les capabilities", async () => {
      await program.methods
        .updateAgent({
          capabilities: ["research", "analysis", "code"],
          endpoint: null,
          status: null,
          version: null,
        })
        .accounts({
          owner: owner.publicKey,
          agent: getAgentPDA(program, agentWalletA.publicKey),
        })
        .signers([owner])
        .rpc();

      const agent = await program.account.agent.fetch(
        getAgentPDA(program, agentWalletA.publicKey)
      );
      expect(agent.capabilities).to.deep.equal(["research", "analysis", "code"]);
    });

    it("met a jour l'endpoint", async () => {
      await program.methods
        .updateAgent({
          capabilities: null,
          endpoint: "https://new-endpoint.example.com",
          status: null,
          version: null,
        })
        .accounts({
          owner: owner.publicKey,
          agent: getAgentPDA(program, agentWalletA.publicKey),
        })
        .signers([owner])
        .rpc();

      const agent = await program.account.agent.fetch(
        getAgentPDA(program, agentWalletA.publicKey)
      );
      expect(agent.endpoint).to.equal("https://new-endpoint.example.com");
    });

    it("met a jour le statut en Suspended", async () => {
      await program.methods
        .updateAgent({
          capabilities: null,
          endpoint: null,
          status: { suspended: {} },
          version: null,
        })
        .accounts({
          owner: owner.publicKey,
          agent: getAgentPDA(program, agentWalletA.publicKey),
        })
        .signers([owner])
        .rpc();

      const agent = await program.account.agent.fetch(
        getAgentPDA(program, agentWalletA.publicKey)
      );
      expect(agent.status).to.deep.equal({ suspended: {} });

      // Remettre en Active pour les tests suivants
      await program.methods
        .updateAgent({
          capabilities: null,
          endpoint: null,
          status: { active: {} },
          version: null,
        })
        .accounts({
          owner: owner.publicKey,
          agent: getAgentPDA(program, agentWalletA.publicKey),
        })
        .signers([owner])
        .rpc();
    });

    it("met a jour la version", async () => {
      await program.methods
        .updateAgent({
          capabilities: null,
          endpoint: null,
          status: null,
          version: "2.0.0",
        })
        .accounts({
          owner: owner.publicKey,
          agent: getAgentPDA(program, agentWalletA.publicKey),
        })
        .signers([owner])
        .rpc();

      const agent = await program.account.agent.fetch(
        getAgentPDA(program, agentWalletA.publicKey)
      );
      expect(agent.version).to.equal("2.0.0");
    });

    it("refuse la mise a jour par un non-owner", async () => {
      const intruder = Keypair.generate();
      await airdrop(provider, intruder.publicKey, 1);

      try {
        await program.methods
          .updateAgent({
            capabilities: null,
            endpoint: "https://hacked.com",
            status: null,
            version: null,
          })
          .accounts({
            owner: intruder.publicKey,
            agent: getAgentPDA(program, agentWalletA.publicKey),
          })
          .signers([intruder])
          .rpc();
        expect.fail("Devrait echouer avec UnauthorizedOwner");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.include(
          "UnauthorizedOwner"
        );
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CREATE ESCROW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("create_escrow", () => {
    // Pour les tests d'escrow, on a besoin que les agents soient aussi des signers.
    // On utilise des keypairs dédies dont les agent_wallets sont les signers.
    let requesterOwner: Keypair;
    let executorOwner: Keypair;
    let requesterWallet: Keypair;
    let executorWallet: Keypair;
    let reqNftMint: Keypair;
    let exeNftMint: Keypair;

    before(async () => {
      requesterOwner = Keypair.generate();
      executorOwner = Keypair.generate();
      requesterWallet = Keypair.generate();
      executorWallet = Keypair.generate();
      reqNftMint = Keypair.generate();
      exeNftMint = Keypair.generate();

      await airdrop(provider, requesterOwner.publicKey, 5);
      await airdrop(provider, executorOwner.publicKey, 5);
      await airdrop(provider, requesterWallet.publicKey, 5);
      await airdrop(provider, executorWallet.publicKey, 5);

      // Enregistrer les deux agents.
      // L'owner enregistre l'agent, mais le agent_wallet doit etre un wallet
      // dont on controle les cles pour signer les escrows.
      await registerAgent(program, requesterOwner, requesterWallet, reqNftMint);
      await registerAgent(program, executorOwner, executorWallet, exeNftMint);
    });

    it("cree un escrow entre deux agents", async () => {
      const taskId = "task-001";
      const amount = new BN(0.1 * LAMPORTS_PER_SOL);
      const deadline = Math.floor(Date.now() / 1000) + 600; // +10 min

      const escrowPda = getEscrowPDA(
        program,
        requesterWallet.publicKey,
        executorWallet.publicKey,
        taskId
      );

      await program.methods
        .createEscrow({
          taskId,
          taskDescription: "Translate this text to French",
          amount,
          deadline: new BN(deadline),
          gracePeriodDuration: new BN(5), // 5 secondes pour les tests
        })
        .accounts({
          requester: requesterWallet.publicKey,
          requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
          executorWallet: executorWallet.publicKey,
          executorAgent: getAgentPDA(program, executorWallet.publicKey),
          executorReputation: getReputationPDA(program, executorWallet.publicKey),
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([requesterWallet])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPda);
      expect(escrow.requester.toBase58()).to.equal(requesterWallet.publicKey.toBase58());
      expect(escrow.executor.toBase58()).to.equal(executorWallet.publicKey.toBase58());
      expect(escrow.taskId).to.equal(taskId);
      expect(escrow.taskDescription).to.equal("Translate this text to French");
      expect(escrow.amount.toNumber()).to.equal(amount.toNumber());
      expect(escrow.status).to.deep.equal({ awaitingResult: {} });
      expect(escrow.resultHash).to.be.null;

      // Verifier que tasks_received a ete incremente
      const exeRep = await program.account.reputation.fetch(
        getReputationPDA(program, executorWallet.publicKey)
      );
      expect(exeRep.tasksReceived.toNumber()).to.equal(1);
    });

    it("refuse un montant de 0", async () => {
      try {
        await program.methods
          .createEscrow({
            taskId: "task-zero",
            taskDescription: "Zero amount task",
            amount: new BN(0),
            deadline: new BN(Math.floor(Date.now() / 1000) + 600),
            gracePeriodDuration: new BN(5),
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: getEscrowPDA(
              program,
              requesterWallet.publicKey,
              executorWallet.publicKey,
              "task-zero"
            ),
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();
        expect.fail("Devrait echouer avec InsufficientFunds");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.include(
          "InsufficientFunds"
        );
      }
    });

    it("refuse un deadline dans le passe", async () => {
      try {
        await program.methods
          .createEscrow({
            taskId: "task-past",
            taskDescription: "Past deadline",
            amount: new BN(0.01 * LAMPORTS_PER_SOL),
            deadline: new BN(1000000), // timestamp tres ancien
            gracePeriodDuration: new BN(5),
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: getEscrowPDA(
              program,
              requesterWallet.publicKey,
              executorWallet.publicKey,
              "task-past"
            ),
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();
        expect.fail("Devrait echouer avec DeadlineExceeded");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.include(
          "DeadlineExceeded"
        );
      }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 4. SUBMIT RESULT
    // ═════════════════════════════════════════════════════════════════════════

    describe("submit_result", () => {
      it("soumet un resultat hash valide", async () => {
        const taskId = "task-001";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        // Hash SHA256 simule
        const resultHash = Array.from({ length: 32 }, (_, i) => i + 1);

        await program.methods
          .submitResult({ resultHash })
          .accounts({
            executor: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
          })
          .signers([executorWallet])
          .rpc();

        const escrow = await program.account.escrow.fetch(escrowPda);
        expect(escrow.status).to.deep.equal({ gracePeriod: {} });
        expect(escrow.resultHash).to.deep.equal(resultHash);
        expect(escrow.submittedAt).to.not.be.null;
        expect(escrow.gracePeriodStart).to.not.be.null;
      });

      it("refuse un hash tout a zero", async () => {
        // Creer un nouvel escrow pour ce test
        const taskId = "task-zerohash";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        await program.methods
          .createEscrow({
            taskId,
            taskDescription: "Zero hash test",
            amount: new BN(0.01 * LAMPORTS_PER_SOL),
            deadline: new BN(Math.floor(Date.now() / 1000) + 600),
            gracePeriodDuration: new BN(5),
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();

        try {
          await program.methods
            .submitResult({ resultHash: Array(32).fill(0) })
            .accounts({
              executor: executorWallet.publicKey,
              executorAgent: getAgentPDA(program, executorWallet.publicKey),
              escrow: escrowPda,
            })
            .signers([executorWallet])
            .rpc();
          expect.fail("Devrait echouer avec InvalidResult");
        } catch (err: any) {
          expect(err.error?.errorCode?.code || err.toString()).to.include(
            "InvalidResult"
          );
        }
      });

      it("refuse la soumission par un non-executor", async () => {
        const taskId = "task-wrong-exec";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        await program.methods
          .createEscrow({
            taskId,
            taskDescription: "Wrong executor test",
            amount: new BN(0.01 * LAMPORTS_PER_SOL),
            deadline: new BN(Math.floor(Date.now() / 1000) + 600),
            gracePeriodDuration: new BN(5),
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();

        try {
          // Le requester essaie de soumettre a la place de l'executor
          await program.methods
            .submitResult({ resultHash: Array.from({ length: 32 }, (_, i) => i) })
            .accounts({
              executor: requesterWallet.publicKey,
              executorAgent: getAgentPDA(program, requesterWallet.publicKey),
              escrow: escrowPda,
            })
            .signers([requesterWallet])
            .rpc();
          expect.fail("Devrait echouer");
        } catch (err: any) {
          // Le PDA escrow ne matche pas car l'executor est different
          expect(err.toString()).to.not.be.empty;
        }
      });

      it("refuse de soumettre deux fois", async () => {
        const taskId = "task-001"; // Deja soumis plus haut
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        try {
          await program.methods
            .submitResult({ resultHash: Array.from({ length: 32 }, (_, i) => i + 10) })
            .accounts({
              executor: executorWallet.publicKey,
              executorAgent: getAgentPDA(program, executorWallet.publicKey),
              escrow: escrowPda,
            })
            .signers([executorWallet])
            .rpc();
          expect.fail("Devrait echouer avec EscrowAlreadyResolved");
        } catch (err: any) {
          expect(err.error?.errorCode?.code || err.toString()).to.include(
            "EscrowAlreadyResolved"
          );
        }
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 5. VERIFY AND RELEASE
    // ═════════════════════════════════════════════════════════════════════════

    describe("verify_and_release", () => {
      it("refuse si le delai de grace n'est pas expire", async () => {
        const taskId = "task-001";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        // Ordonner les wallets
        const [pairA, pairB] =
          requesterWallet.publicKey.toBuffer().compare(executorWallet.publicKey.toBuffer()) < 0
            ? [requesterWallet.publicKey, executorWallet.publicKey]
            : [executorWallet.publicKey, requesterWallet.publicKey];

        try {
          await program.methods
            .verifyAndRelease()
            .accounts({
              anyone: owner.publicKey,
              escrow: escrowPda,
              executorAgent: getAgentPDA(program, executorWallet.publicKey),
              executorReputation: getReputationPDA(program, executorWallet.publicKey),
              requesterReputation: getReputationPDA(program, requesterWallet.publicKey),
              pairAgentA: pairA,
              pairAgentB: pairB,
              interactionPair: getInteractionPairPDA(
                program,
                requesterWallet.publicKey,
                executorWallet.publicKey
              ),
              executorWallet: executorWallet.publicKey,
              treasury: TREASURY,
              systemProgram: SystemProgram.programId,
            })
            .signers([owner])
            .rpc();
          expect.fail("Devrait echouer avec GracePeriodNotExpired");
        } catch (err: any) {
          expect(err.error?.errorCode?.code || err.toString()).to.include(
            "GracePeriodNotExpired"
          );
        }
      });

      it("libere l'escrow apres expiration du delai de grace", async () => {
        const taskId = "task-001";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        // Attendre que le grace period expire (5 secondes + marge)
        await sleep(6000);

        const [pairA, pairB] =
          requesterWallet.publicKey.toBuffer().compare(executorWallet.publicKey.toBuffer()) < 0
            ? [requesterWallet.publicKey, executorWallet.publicKey]
            : [executorWallet.publicKey, requesterWallet.publicKey];

        // Capturer le solde de l'executor avant
        const executorBalanceBefore = await provider.connection.getBalance(
          executorWallet.publicKey
        );

        await program.methods
          .verifyAndRelease()
          .accounts({
            anyone: owner.publicKey,
            escrow: escrowPda,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            requesterReputation: getReputationPDA(program, requesterWallet.publicKey),
            pairAgentA: pairA,
            pairAgentB: pairB,
            interactionPair: getInteractionPairPDA(
              program,
              requesterWallet.publicKey,
              executorWallet.publicKey
            ),
            executorWallet: executorWallet.publicKey,
            treasury: TREASURY,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();

        // Verifier statut Released
        const escrow = await program.account.escrow.fetch(escrowPda);
        expect(escrow.status).to.deep.equal({ released: {} });

        // Verifier que l'executor a recu les fonds (montant - 0.1% commission)
        const executorBalanceAfter = await provider.connection.getBalance(
          executorWallet.publicKey
        );
        const expectedPayment = 0.1 * LAMPORTS_PER_SOL;
        const commission = (expectedPayment * 10) / 10000;
        const expectedNet = expectedPayment - commission;
        expect(executorBalanceAfter - executorBalanceBefore).to.equal(expectedNet);

        // Verifier reputation executor
        const exeRep = await program.account.reputation.fetch(
          getReputationPDA(program, executorWallet.publicKey)
        );
        expect(exeRep.tasksCompleted.toNumber()).to.equal(1);
        expect(exeRep.uniqueRequesters.toNumber()).to.equal(1);
        expect(exeRep.score.toNumber()).to.be.greaterThan(0);

        // Verifier reputation requester
        const reqRep = await program.account.reputation.fetch(
          getReputationPDA(program, requesterWallet.publicKey)
        );
        expect(reqRep.tasksDelegated.toNumber()).to.equal(1);

        // Verifier InteractionPair
        const pair = await program.account.interactionPair.fetch(
          getInteractionPairPDA(
            program,
            requesterWallet.publicKey,
            executorWallet.publicKey
          )
        );
        expect(pair.alreadyCounted).to.be.true;
      });

      it("refuse de liberer un escrow deja libere", async () => {
        const taskId = "task-001";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        const [pairA, pairB] =
          requesterWallet.publicKey.toBuffer().compare(executorWallet.publicKey.toBuffer()) < 0
            ? [requesterWallet.publicKey, executorWallet.publicKey]
            : [executorWallet.publicKey, requesterWallet.publicKey];

        try {
          await program.methods
            .verifyAndRelease()
            .accounts({
              anyone: owner.publicKey,
              escrow: escrowPda,
              executorAgent: getAgentPDA(program, executorWallet.publicKey),
              executorReputation: getReputationPDA(program, executorWallet.publicKey),
              requesterReputation: getReputationPDA(program, requesterWallet.publicKey),
              pairAgentA: pairA,
              pairAgentB: pairB,
              interactionPair: getInteractionPairPDA(
                program,
                requesterWallet.publicKey,
                executorWallet.publicKey
              ),
              executorWallet: executorWallet.publicKey,
              treasury: TREASURY,
              systemProgram: SystemProgram.programId,
            })
            .signers([owner])
            .rpc();
          expect.fail("Devrait echouer avec EscrowAlreadyResolved");
        } catch (err: any) {
          expect(err.error?.errorCode?.code || err.toString()).to.include(
            "EscrowAlreadyResolved"
          );
        }
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 6. CONTEST ESCROW
    // ═════════════════════════════════════════════════════════════════════════

    describe("contest_escrow", () => {
      let contestTaskId: string;

      before(async () => {
        // Creer un nouvel escrow + soumettre resultat (grace period = 60s pour tester)
        contestTaskId = "task-contest";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          contestTaskId
        );

        await program.methods
          .createEscrow({
            taskId: contestTaskId,
            taskDescription: "Contestable task",
            amount: new BN(0.05 * LAMPORTS_PER_SOL),
            deadline: new BN(Math.floor(Date.now() / 1000) + 600),
            gracePeriodDuration: new BN(60), // 60s — assez long pour contester
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();

        await program.methods
          .submitResult({
            resultHash: Array.from({ length: 32 }, (_, i) => i + 50),
          })
          .accounts({
            executor: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
          })
          .signers([executorWallet])
          .rpc();
      });

      it("conteste un escrow pendant le delai de grace", async () => {
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          contestTaskId
        );

        await program.methods
          .contestEscrow()
          .accounts({
            requester: requesterWallet.publicKey,
            escrow: escrowPda,
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            requesterReputation: getReputationPDA(
              program,
              requesterWallet.publicKey
            ),
          })
          .signers([requesterWallet])
          .rpc();

        const escrow = await program.account.escrow.fetch(escrowPda);
        expect(escrow.status).to.deep.equal({ contested: {} });

        // Verifier reputation
        const exeRep = await program.account.reputation.fetch(
          getReputationPDA(program, executorWallet.publicKey)
        );
        expect(exeRep.contestsReceived.toNumber()).to.equal(1);

        const reqRep = await program.account.reputation.fetch(
          getReputationPDA(program, requesterWallet.publicKey)
        );
        expect(reqRep.contestsEmitted.toNumber()).to.equal(1);
      });

      it("refuse la contestation par un non-requester", async () => {
        // Creer un nouveau scenario
        const taskId = "task-contest-unauth";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        await program.methods
          .createEscrow({
            taskId,
            taskDescription: "Unauthorized contest",
            amount: new BN(0.01 * LAMPORTS_PER_SOL),
            deadline: new BN(Math.floor(Date.now() / 1000) + 600),
            gracePeriodDuration: new BN(60),
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();

        await program.methods
          .submitResult({
            resultHash: Array.from({ length: 32 }, (_, i) => i + 100),
          })
          .accounts({
            executor: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
          })
          .signers([executorWallet])
          .rpc();

        try {
          // L'executor essaie de contester (pas le requester)
          await program.methods
            .contestEscrow()
            .accounts({
              requester: executorWallet.publicKey,
              escrow: escrowPda,
              executorReputation: getReputationPDA(program, executorWallet.publicKey),
              requesterReputation: getReputationPDA(
                program,
                requesterWallet.publicKey
              ),
            })
            .signers([executorWallet])
            .rpc();
          expect.fail("Devrait echouer avec UnauthorizedOwner");
        } catch (err: any) {
          expect(err.error?.errorCode?.code || err.toString()).to.include(
            "UnauthorizedOwner"
          );
        }
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 7. REFUND ESCROW
    // ═════════════════════════════════════════════════════════════════════════

    describe("refund_escrow", () => {
      it("rembourse un escrow conteste", async () => {
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          "task-contest" // Conteste plus haut
        );

        const requesterBalanceBefore = await provider.connection.getBalance(
          requesterWallet.publicKey
        );

        await program.methods
          .refundEscrow()
          .accounts({
            anyone: owner.publicKey,
            escrow: escrowPda,
            requesterWallet: requesterWallet.publicKey,
          })
          .signers([owner])
          .rpc();

        const escrow = await program.account.escrow.fetch(escrowPda);
        expect(escrow.status).to.deep.equal({ refunded: {} });

        // Verifier remboursement (montant complet, pas de commission)
        const requesterBalanceAfter = await provider.connection.getBalance(
          requesterWallet.publicKey
        );
        const expectedRefund = 0.05 * LAMPORTS_PER_SOL;
        expect(requesterBalanceAfter - requesterBalanceBefore).to.equal(
          expectedRefund
        );
      });

      it("rembourse un escrow dont le deadline est expire", async () => {
        const taskId = "task-expired";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        // Deadline dans 4 secondes (marge pour le validateur local)
        await program.methods
          .createEscrow({
            taskId,
            taskDescription: "Will expire",
            amount: new BN(0.02 * LAMPORTS_PER_SOL),
            deadline: new BN(Math.floor(Date.now() / 1000) + 4),
            gracePeriodDuration: new BN(5),
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();

        // Attendre l'expiration du deadline (marge supplementaire)
        await sleep(8000);

        await program.methods
          .refundEscrow()
          .accounts({
            anyone: owner.publicKey,
            escrow: escrowPda,
            requesterWallet: requesterWallet.publicKey,
          })
          .signers([owner])
          .rpc();

        const escrow = await program.account.escrow.fetch(escrowPda);
        expect(escrow.status).to.deep.equal({ refunded: {} });
      });

      it("refuse le remboursement d'un escrow en attente (deadline pas expire)", async () => {
        const taskId = "task-norefund";
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          taskId
        );

        await program.methods
          .createEscrow({
            taskId,
            taskDescription: "Should not refund yet",
            amount: new BN(0.01 * LAMPORTS_PER_SOL),
            deadline: new BN(Math.floor(Date.now() / 1000) + 600),
            gracePeriodDuration: new BN(60),
          })
          .accounts({
            requester: requesterWallet.publicKey,
            requesterAgent: getAgentPDA(program, requesterWallet.publicKey),
            executorWallet: executorWallet.publicKey,
            executorAgent: getAgentPDA(program, executorWallet.publicKey),
            executorReputation: getReputationPDA(program, executorWallet.publicKey),
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([requesterWallet])
          .rpc();

        try {
          await program.methods
            .refundEscrow()
            .accounts({
              anyone: owner.publicKey,
              escrow: escrowPda,
              requesterWallet: requesterWallet.publicKey,
            })
            .signers([owner])
            .rpc();
          expect.fail("Devrait echouer avec EscrowAlreadyResolved");
        } catch (err: any) {
          expect(err.error?.errorCode?.code || err.toString()).to.include(
            "EscrowAlreadyResolved"
          );
        }
      });

      it("refuse le remboursement d'un escrow deja libere", async () => {
        // task-001 est Released
        const escrowPda = getEscrowPDA(
          program,
          requesterWallet.publicKey,
          executorWallet.publicKey,
          "task-001"
        );

        try {
          await program.methods
            .refundEscrow()
            .accounts({
              anyone: owner.publicKey,
              escrow: escrowPda,
              requesterWallet: requesterWallet.publicKey,
            })
            .signers([owner])
            .rpc();
          expect.fail("Devrait echouer avec EscrowAlreadyResolved");
        } catch (err: any) {
          expect(err.error?.errorCode?.code || err.toString()).to.include(
            "EscrowAlreadyResolved"
          );
        }
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 8. WITHDRAW STAKE
    // ═════════════════════════════════════════════════════════════════════════

    describe("withdraw_stake", () => {
      let withdrawOwner: Keypair;
      let withdrawWallet: Keypair;
      let withdrawMint: Keypair;

      before(async () => {
        withdrawOwner = Keypair.generate();
        withdrawWallet = Keypair.generate();
        withdrawMint = Keypair.generate();

        await airdrop(provider, withdrawOwner.publicKey, 3);

        await registerAgent(program, withdrawOwner, withdrawWallet, withdrawMint, {
          name: "WithdrawTest",
          stakeAmount: new BN(0.1 * LAMPORTS_PER_SOL),
        });
      });

      it("retire le stake et deprecie l'agent", async () => {
        const ownerBalanceBefore = await provider.connection.getBalance(
          withdrawOwner.publicKey
        );

        await program.methods
          .withdrawStake()
          .accounts({
            owner: withdrawOwner.publicKey,
            agentWallet: withdrawWallet.publicKey,
            agent: getAgentPDA(program, withdrawWallet.publicKey),
            stakeVault: getStakeVaultPDA(program, withdrawWallet.publicKey),
            ownerRegistry: getOwnerRegistryPDA(program, withdrawOwner.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([withdrawOwner])
          .rpc();

        // Agent passe en Deprecated
        const agent = await program.account.agent.fetch(
          getAgentPDA(program, withdrawWallet.publicKey)
        );
        expect(agent.status).to.deep.equal({ deprecated: {} });

        // Vault vide
        const vault = await program.account.stakeVault.fetch(
          getStakeVaultPDA(program, withdrawWallet.publicKey)
        );
        expect(vault.stakeAmount.toNumber()).to.equal(0);

        // Owner a recupere les lamports (moins les fees de tx)
        const ownerBalanceAfter = await provider.connection.getBalance(
          withdrawOwner.publicKey
        );
        expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);

        // Compteur decremente
        const registry = await program.account.ownerRegistry.fetch(
          getOwnerRegistryPDA(program, withdrawOwner.publicKey)
        );
        expect(registry.agentCount).to.equal(0);
      });

      it("refuse un deuxieme retrait (deja retire)", async () => {
        try {
          await program.methods
            .withdrawStake()
            .accounts({
              owner: withdrawOwner.publicKey,
              agentWallet: withdrawWallet.publicKey,
              agent: getAgentPDA(program, withdrawWallet.publicKey),
              stakeVault: getStakeVaultPDA(program, withdrawWallet.publicKey),
              ownerRegistry: getOwnerRegistryPDA(program, withdrawOwner.publicKey),
              systemProgram: SystemProgram.programId,
            })
            .signers([withdrawOwner])
            .rpc();
          expect.fail("Devrait echouer");
        } catch (err: any) {
          // AgentInactive (deprecated) ou StakeAlreadyWithdrawn
          expect(err.toString()).to.not.be.empty;
        }
      });

      it("refuse le retrait par un non-owner", async () => {
        // Utiliser les agents enregistres dans le before principal
        const intruder = Keypair.generate();
        await airdrop(provider, intruder.publicKey, 1);

        try {
          await program.methods
            .withdrawStake()
            .accounts({
              owner: intruder.publicKey,
              agentWallet: agentWalletA.publicKey,
              agent: getAgentPDA(program, agentWalletA.publicKey),
              stakeVault: getStakeVaultPDA(program, agentWalletA.publicKey),
              ownerRegistry: getOwnerRegistryPDA(program, intruder.publicKey),
              systemProgram: SystemProgram.programId,
            })
            .signers([intruder])
            .rpc();
          expect.fail("Devrait echouer");
        } catch (err: any) {
          // Peut etre UnauthorizedOwner ou AccountNotInitialized
          // (le PDA ownerRegistry n'existe pas pour l'intruder)
          const msg = err.error?.errorCode?.code || err.toString();
          expect(msg).to.satisfy(
            (m: string) =>
              m.includes("UnauthorizedOwner") ||
              m.includes("AccountNotInitialized")
          );
        }
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. INTEGRATION — Flow complet end-to-end
  // ═══════════════════════════════════════════════════════════════════════════

  describe("integration: flow complet create → submit → release", () => {
    let reqOwner: Keypair;
    let exeOwner: Keypair;
    let reqWallet: Keypair;
    let exeWallet: Keypair;

    before(async () => {
      reqOwner = Keypair.generate();
      exeOwner = Keypair.generate();
      reqWallet = Keypair.generate();
      exeWallet = Keypair.generate();

      await Promise.all([
        airdrop(provider, reqOwner.publicKey, 5),
        airdrop(provider, exeOwner.publicKey, 5),
        airdrop(provider, reqWallet.publicKey, 5),
        airdrop(provider, exeWallet.publicKey, 5),
      ]);

      await registerAgent(program, reqOwner, reqWallet, Keypair.generate(), {
        name: "IntegReq",
        capabilities: ["research"],
      });
      await registerAgent(program, exeOwner, exeWallet, Keypair.generate(), {
        name: "IntegExe",
        capabilities: ["translation"],
      });
    });

    it("execute le cycle complet: create → submit → wait → release → verifie reputation + paiement", async () => {
      const taskId = "integ-e2e";
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const gracePeriod = 3; // 3 secondes

      const escrowPda = getEscrowPDA(
        program,
        reqWallet.publicKey,
        exeWallet.publicKey,
        taskId
      );

      // Étape 1: Create escrow
      await program.methods
        .createEscrow({
          taskId,
          taskDescription: "Full integration test",
          amount,
          deadline: new BN(Math.floor(Date.now() / 1000) + 300),
          gracePeriodDuration: new BN(gracePeriod),
        })
        .accounts({
          requester: reqWallet.publicKey,
          requesterAgent: getAgentPDA(program, reqWallet.publicKey),
          executorWallet: exeWallet.publicKey,
          executorAgent: getAgentPDA(program, exeWallet.publicKey),
          executorReputation: getReputationPDA(program, exeWallet.publicKey),
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([reqWallet])
        .rpc();

      let escrow = await program.account.escrow.fetch(escrowPda);
      expect(escrow.status).to.deep.equal({ awaitingResult: {} });

      // Étape 2: Submit result
      const resultHash = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
      );
      await program.methods
        .submitResult({ resultHash })
        .accounts({
          executor: exeWallet.publicKey,
          executorAgent: getAgentPDA(program, exeWallet.publicKey),
          escrow: escrowPda,
        })
        .signers([exeWallet])
        .rpc();

      escrow = await program.account.escrow.fetch(escrowPda);
      expect(escrow.status).to.deep.equal({ gracePeriod: {} });

      // Étape 3: Attendre grace period
      await sleep((gracePeriod + 2) * 1000);

      // Étape 4: Release
      const [pairA, pairB] =
        reqWallet.publicKey.toBuffer().compare(exeWallet.publicKey.toBuffer()) < 0
          ? [reqWallet.publicKey, exeWallet.publicKey]
          : [exeWallet.publicKey, reqWallet.publicKey];

      const exeBalBefore = await provider.connection.getBalance(exeWallet.publicKey);

      await program.methods
        .verifyAndRelease()
        .accounts({
          anyone: reqOwner.publicKey,
          escrow: escrowPda,
          executorAgent: getAgentPDA(program, exeWallet.publicKey),
          executorReputation: getReputationPDA(program, exeWallet.publicKey),
          requesterReputation: getReputationPDA(program, reqWallet.publicKey),
          pairAgentA: pairA,
          pairAgentB: pairB,
          interactionPair: getInteractionPairPDA(
            program,
            reqWallet.publicKey,
            exeWallet.publicKey
          ),
          executorWallet: exeWallet.publicKey,
          treasury: TREASURY,
          systemProgram: SystemProgram.programId,
        })
        .signers([reqOwner])
        .rpc();

      // Verifications finales
      escrow = await program.account.escrow.fetch(escrowPda);
      expect(escrow.status).to.deep.equal({ released: {} });

      // Paiement correct (amount - 0.1% commission)
      const exeBalAfter = await provider.connection.getBalance(exeWallet.publicKey);
      const commission = Math.floor((1 * LAMPORTS_PER_SOL * 10) / 10000);
      const expectedPay = 1 * LAMPORTS_PER_SOL - commission;
      expect(exeBalAfter - exeBalBefore).to.equal(expectedPay);

      // Reputation executor
      const exeRep = await program.account.reputation.fetch(
        getReputationPDA(program, exeWallet.publicKey)
      );
      expect(exeRep.tasksReceived.toNumber()).to.equal(1);
      expect(exeRep.tasksCompleted.toNumber()).to.equal(1);
      expect(exeRep.uniqueRequesters.toNumber()).to.equal(1);
      expect(exeRep.score.toNumber()).to.be.greaterThan(0);

      // Reputation requester
      const reqRep = await program.account.reputation.fetch(
        getReputationPDA(program, reqWallet.publicKey)
      );
      expect(reqRep.tasksDelegated.toNumber()).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. ANTI-FARMING — InteractionPair
  // ═══════════════════════════════════════════════════════════════════════════

  describe("anti-farming: InteractionPair ne compte qu'une fois", () => {
    let afReqOwner: Keypair;
    let afExeOwner: Keypair;
    let afReqWallet: Keypair;
    let afExeWallet: Keypair;

    before(async () => {
      afReqOwner = Keypair.generate();
      afExeOwner = Keypair.generate();
      afReqWallet = Keypair.generate();
      afExeWallet = Keypair.generate();

      await Promise.all([
        airdrop(provider, afReqOwner.publicKey, 10),
        airdrop(provider, afExeOwner.publicKey, 5),
        airdrop(provider, afReqWallet.publicKey, 10),
        airdrop(provider, afExeWallet.publicKey, 5),
      ]);

      await registerAgent(program, afReqOwner, afReqWallet, Keypair.generate(), {
        name: "FarmReq",
      });
      await registerAgent(program, afExeOwner, afExeWallet, Keypair.generate(), {
        name: "FarmExe",
      });
    });

    it("unique_requesters n'augmente qu'une seule fois pour la meme paire", async () => {
      const gracePeriod = 2;

      // Faire 2 escrows entre la meme paire
      for (let i = 0; i < 2; i++) {
        const taskId = `farm-task-${i}`;
        const escrowPda = getEscrowPDA(
          program,
          afReqWallet.publicKey,
          afExeWallet.publicKey,
          taskId
        );

        await program.methods
          .createEscrow({
            taskId,
            taskDescription: `Anti-farming test ${i}`,
            amount: new BN(0.01 * LAMPORTS_PER_SOL),
            deadline: new BN(Math.floor(Date.now() / 1000) + 300),
            gracePeriodDuration: new BN(gracePeriod),
          })
          .accounts({
            requester: afReqWallet.publicKey,
            requesterAgent: getAgentPDA(program, afReqWallet.publicKey),
            executorWallet: afExeWallet.publicKey,
            executorAgent: getAgentPDA(program, afExeWallet.publicKey),
            executorReputation: getReputationPDA(program, afExeWallet.publicKey),
            escrow: escrowPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([afReqWallet])
          .rpc();

        await program.methods
          .submitResult({
            resultHash: Array.from({ length: 32 }, () =>
              Math.floor(Math.random() * 256)
            ),
          })
          .accounts({
            executor: afExeWallet.publicKey,
            executorAgent: getAgentPDA(program, afExeWallet.publicKey),
            escrow: escrowPda,
          })
          .signers([afExeWallet])
          .rpc();

        await sleep((gracePeriod + 2) * 1000);

        const [pairA, pairB] =
          afReqWallet.publicKey.toBuffer().compare(afExeWallet.publicKey.toBuffer()) < 0
            ? [afReqWallet.publicKey, afExeWallet.publicKey]
            : [afExeWallet.publicKey, afReqWallet.publicKey];

        await program.methods
          .verifyAndRelease()
          .accounts({
            anyone: afReqOwner.publicKey,
            escrow: escrowPda,
            executorAgent: getAgentPDA(program, afExeWallet.publicKey),
            executorReputation: getReputationPDA(program, afExeWallet.publicKey),
            requesterReputation: getReputationPDA(program, afReqWallet.publicKey),
            pairAgentA: pairA,
            pairAgentB: pairB,
            interactionPair: getInteractionPairPDA(
              program,
              afReqWallet.publicKey,
              afExeWallet.publicKey
            ),
            executorWallet: afExeWallet.publicKey,
            treasury: TREASURY,
            systemProgram: SystemProgram.programId,
          })
          .signers([afReqOwner])
          .rpc();
      }

      // Apres 2 escrows, unique_requesters devrait etre 1 (pas 2)
      const exeRep = await program.account.reputation.fetch(
        getReputationPDA(program, afExeWallet.publicKey)
      );
      expect(exeRep.tasksCompleted.toNumber()).to.equal(2);
      expect(exeRep.uniqueRequesters.toNumber()).to.equal(1); // Anti-farming !
    });
  });
});
