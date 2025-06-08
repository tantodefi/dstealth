import React, { useState } from 'react';
import styles from '../styles/FAQ.module.css';

interface AccordionItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
}

interface FAQProps {
  isOpen: boolean;
  onClose: () => void;
}

const faqData = [
  {
    question: 'What is this application?',
    answer: 'This is a mini-app that demonstrates the power of XMTP, a secure messaging protocol for web3. It showcases features like stealth addresses, x402 payments, and more, all built on the Base blockchain.',
  },
  {
    question: 'What are rewards and how do I earn them?',
    answer: 'You can earn rewards in the form of NINJA tokens by using the app and completing certain actions. These tokens can be used to access exclusive features and benefits within the ecosystem.',
  },
  {
    question: 'What is x402 protocol?',
    answer: 'X402 is a protocol for requesting payment for access to digital content or services. It allows creators to monetize their content directly through cryptocurrency payments.',
  },
  {
    question: 'How does XMTP messaging work?',
    answer: 'XMTP (Extensible Message Transport Protocol) enables secure, decentralized messaging between Ethereum addresses. Messages are encrypted end-to-end and stored on a decentralized network.',
  },
  {
    question: 'What are stealth addresses?',
    answer: 'Stealth addresses provide enhanced privacy by allowing users to receive payments to addresses that cannot be linked to their main identity on the blockchain.',
  },
  {
    question: 'How do I connect my wallet?',
    answer: 'Click the "Connect Wallet" button and select your preferred wallet provider (MetaMask, Coinbase Wallet, etc.). You can also use an ephemeral wallet for quick testing.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes, all messages are encrypted end-to-end using XMTP protocol. Your private keys never leave your device, and we follow industry best practices for security.',
  },
  {
    question: 'What blockchains are supported?',
    answer: 'Currently, the app primarily supports Base and Base Sepolia networks. We may add support for additional networks in the future.',
  },
];

const AccordionItem: React.FC<AccordionItemProps> = ({ question, answer, isOpen, onClick }) => {
  return (
    <div className={styles.accordionItem}>
      <button className={styles.accordionButton} onClick={onClick}>
        <span className={styles.question}>{question}</span>
        <span className={styles.icon}>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className={styles.answer}>{answer}</div>}
    </div>
  );
};

const FAQ: React.FC<FAQProps> = ({ isOpen, onClose }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div 
        className={`${styles.modalContent} mobile-scroll hide-scrollbar`} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2>Frequently Asked Questions</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mobile-scroll hide-scrollbar">
          {faqData.map((item, index) => (
            <AccordionItem
              key={index}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === index}
              onClick={() => handleToggle(index)}
            />
          ))}
        </div>
        <div className="text-center mt-6 pt-4">
          <p className="text-xs text-gray-400">
            Built with ❤️ on XMTP on 🔵
          </p>
        </div>
      </div>
    </div>
  );
};

export default FAQ; 