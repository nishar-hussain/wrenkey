"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    id: "1",
    question: "How does wallet key management work?",
    answer:
      "WranKey uses HD (hierarchical deterministic) key derivation to create wallets. Your private keys never leave the cryptographic enclave. You can create wallets programmatically via the API, tag them by purpose, and query balances and transaction history. The enclave holds the keys — you never have to store seed phrases or raw private keys.",
  },
  {
    id: "2",
    question: "What happens if someone loses their key?",
    answer:
      "WranKey supports Shamir Secret Sharing for key recovery. When you create a signing key, you can split it into N shares where any T shares can reconstruct the original key. If one team member loses their share, the key is still recoverable from the remaining shares. No single person is a point of failure.",
  },
  {
    id: "3",
    question: "How does multi-party signing work?",
    answer:
      "For high-value operations, WranKey supports multi-party quorum approval. Operator key ceremonies require multiple signatures before a transaction is signed or a deployment is approved. No single engineer can push changes to production wallets — it takes consensus from the quorum.",
  },
  {
    id: "4",
    question: "Can I verify transaction signatures independently?",
    answer:
      "Yes. Every transaction signed by WranKey produces a P-256 ECDSA attestation document. You can verify the signature in-browser using our `@wrankey/wvc-verify/browser` library with the Web Crypto API — no server or node required. The math checks out or it doesn't.",
  },
  {
    id: "5",
    question: "What audit and compliance features are included?",
    answer:
      "Every wallet creation, transaction signature, key ceremony, and deployment approval is logged with a cryptographic proof. The attestation documents serve as compliance artifacts — they prove the operation happened correctly, when it happened, and who authorized it. Audit prep goes from weeks to an afternoon.",
  },
];

export function FaqSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleQuestion = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <section
      id="faq"
      className="w-full bg-zinc-900 py-24 md:py-32 border-b border-zinc-700/30"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Left Column - Header */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 px-4 py-2 border border-zinc-700 w-fit">
              <div className="w-2.5 h-2.5 bg-amber-500" />
              <span className="text-sm font-medium text-zinc-400 tracking-wide">
                FAQ
              </span>
            </div>
            
            <h2 className="text-balance text-4xl md:text-5xl lg:text-6xl font-normal text-white tracking-tight leading-[1.1]">
              {"Common Questions".split(" ").map((word, i) => (
                <motion.span
                  key={i}
                  initial={{ filter: "blur(10px)", opacity: 0 }}
                  whileInView={{ filter: "blur(0px)", opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="inline-block mr-[0.25em]"
                >
                  {word}
                </motion.span>
              ))}
            </h2>

            <p className="text-balance text-base md:text-lg text-zinc-400 leading-relaxed max-w-md">
              Get quick answers about WranKey&apos;s wallet infrastructure —
              key management, transaction signing, Shamir recovery, and
              cryptographic proofs. Can&apos;t find what you need? Reach out
              to our team.
            </p>
          </div>

          {/* Right Column - FAQ Items */}
          <div className="flex flex-col">
            {faqs.map((faq, index) => (
              <div
                key={faq.id}
                className={cn(
                  "border-t border-zinc-700/30",
                  index === faqs.length - 1 && "border-b"
                )}
              >
                <button
                  onClick={() => toggleQuestion(faq.id)}
                  className="w-full py-6 flex items-center justify-between gap-4 text-left group"
                >
                  <span className="text-lg md:text-xl font-normal text-white group-hover:text-zinc-300 transition-colors">
                    {faq.question}
                  </span>
                  <motion.div
                    animate={{ rotate: openId === faq.id ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDown className="w-5 h-5 text-zinc-400" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {openId === faq.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="pb-6 pr-12">
                        <p className="text-base leading-relaxed text-zinc-400">
                          {faq.answer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
