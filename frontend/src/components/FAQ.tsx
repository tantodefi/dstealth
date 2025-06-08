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
    answer: 'You can earn rewards in the form of NINJA tokens by using the app and completing certain actions. These tokens can be used to access exclusive features and content.',
  },
  {
    question: 'What is Fluidkey and fley.id?',
    answer: 'Fluidkey is a protocol that enables stealth addresses on Base. fley.id is a service that provides human-readable names for your stealth addresses, making them easier to use.',
  },
  {
    question: 'What are Convos and convos.org?',
    answer: 'Convos is a decentralized conversation platform powered by XMTP. convos.org is the main hub for Convos, where you can find and join conversations on various topics.',
  },
  {
    question: 'Why use stealth addresses on Base?',
    answer: 'Stealth addresses provide a higher level of privacy for your transactions on Base. By using stealth addresses, you can make Base the most private chain for your web3 activities.',
  },
  {
    question: 'What are x402 payments?',
    answer: 'x402 is a protocol for token-based access control. It allows you to pay for content and services with tokens directly in your wallet, without needing to go through a centralized payment processor.',
  },
];

const AccordionItem: React.FC<AccordionItemProps> = ({ question, answer, isOpen, onClick }) => (
  <div className={styles.accordionItem}>
    <button className={styles.accordionButton} onClick={onClick}>
      <span className={styles.question}>{question}</span>
      <span className={styles.icon}>{isOpen ? '-' : '+'}</span>
    </button>
    {isOpen && <div className={styles.answer}>{answer}</div>}
  </div>
);

const FAQ: React.FC<FAQProps> = ({ isOpen, onClose }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Frequently Asked Questions</h2>
          <button className={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>
        <div className={styles.modalBody}>
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
      </div>
    </div>
  );
};

export default FAQ; 