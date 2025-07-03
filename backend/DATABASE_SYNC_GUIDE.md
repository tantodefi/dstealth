# Database Sync & Conversation Audit Tools

This guide explains how to sync databases between localhost and production, and how to audit agent conversations for problematic payment links.

## 🔄 Database Sync Tools

### Quick Commands

```bash
# Check database stats for current environment
yarn db:stats

# Test Redis connection
yarn db:test

# Export database stats to JSON file
yarn db:export
```

### Environment Switching

To compare databases between environments:

1. **Production Stats**:
   ```bash
   XMTP_ENV=production yarn db:stats
   XMTP_ENV=production yarn db:export production-stats.json
   ```

2. **Local Stats**:
   ```bash
   XMTP_ENV=dev yarn db:stats
   XMTP_ENV=dev yarn db:export local-stats.json
   ```

3. **Compare manually** using the exported JSON files

### Manual Database Sync

Since the databases use different Redis instances, you'll need to manually transfer data:

1. **Export from Production**:
   ```bash
   # SSH into production server or use production environment
   XMTP_ENV=production yarn db:export prod-backup.json
   ```

2. **Download the backup file** from production to local

3. **Import to Local** (manual process - would need custom import script)

## 🔍 Conversation Audit Tools

### Generate Conversation Audit Report

```bash
# Audit all conversations and generate report
yarn audit:conversations

# Specify custom output directory
yarn audit:conversations /path/to/output
```

### What the Audit Finds

The conversation audit tool analyzes all XMTP conversations and identifies:

#### 🚨 **Bad Payment Links** (Critical Issues):
- Links containing `localhost` URLs in production
- Links using hardcoded fallback addresses (`0x706AfBE28b1e1CB40cd552Fa53A380f658e38332`)
- Links with error messages

#### ⚠️ **Suspicious Payment Links** (Needs Review):
- Links created without fresh data verification (no "Fresh Data ✅" or "Live" indicators)
- Links with unusually high amounts (>$10,000)
- Links with error/failure messages

#### ✅ **Good Payment Links**:
- Links with fresh data verification
- Proper stealth addresses
- Reasonable amounts

### Report Output

The audit generates several files in `.data/audit/`:

1. **`audit-report-YYYY-MM-DD.json`** - Machine-readable JSON report
2. **`audit-report-YYYY-MM-DD.txt`** - Human-readable summary
3. **`cleanup-YYYY-MM-DD.sh`** - Cleanup script (if issues found)

### Example Audit Report Structure

```json
{
  "summary": {
    "totalConversations": 25,
    "totalPaymentLinks": 12,
    "badLinks": 2,
    "suspiciousLinks": 1,
    "auditedAt": "2024-07-02T20:00:00.000Z",
    "environment": "production"
  },
  "conversations": [
    {
      "conversationId": "abc123...",
      "type": "dm",
      "messageCount": 45,
      "paymentLinks": [
        {
          "messageId": "msg123",
          "timestamp": "2024-07-02T19:30:00.000Z",
          "amount": "50.00",
          "recipient": "0x1234...",
          "daimoLink": "https://pay.daimo.com/checkout?id=...",
          "status": "bad",
          "issues": ["Uses hardcoded fallback address"]
        }
      ]
    }
  ]
}
```

## 🧹 Manual Cleanup Process

When problematic links are found:

1. **Review the audit report** to understand the issues
2. **Contact affected users** using the conversation IDs
3. **Generate new payment links** for users with bad links
4. **Educate users** about using fresh links

### Example Manual Follow-up:

```bash
# After audit finds issues, you can:

# 1. Check specific conversation
# Use the conversation ID from the report to identify the user

# 2. Contact the user via XMTP
# Send them a message explaining the issue and offering to create a new link

# 3. Generate fresh payment link
# Have the user request a new payment link, which will now use fresh data
```

## 🔧 Advanced Usage

### Direct Script Execution

```bash
# Run conversation audit directly
npx tsx scripts/conversation-audit.ts

# Run database sync directly  
npx tsx scripts/db-sync.ts stats

# With custom parameters
npx tsx scripts/conversation-audit.ts /custom/output/path
npx tsx scripts/db-sync.ts export custom-filename.json
```

### Environment Variables Required

```bash
WALLET_KEY=0x...           # Agent's private key
ENCRYPTION_KEY=...         # Database encryption key  
XMTP_ENV=production        # XMTP environment (dev/production)
UPSTASH_REDIS_REST_URL=... # Redis connection URL
UPSTASH_REDIS_REST_TOKEN=...# Redis auth token
```

## 🚨 Security Considerations

### Database Sync
- **Never sync production keys to localhost** without proper security
- **Use VPN or secure connection** when accessing production databases
- **Test sync operations** on development data first

### Conversation Audit
- **Review all "bad" links immediately** - they may expose users to security risks
- **Contact users with bad links** to generate fresh ones
- **Monitor audit reports regularly** to catch issues early

### Payment Link Cleanup
- **DO NOT disable payment links** without user consent
- **Always offer to create fresh links** for affected users
- **Document any manual interventions** for audit trails

## 📊 Monitoring Schedule

### Recommended Frequency:
- **Daily**: Run conversation audit in production
- **Weekly**: Compare database stats between environments  
- **Monthly**: Full database sync review and cleanup

### Automation Ideas:
- Set up GitHub Actions to run audits automatically
- Create alerts for critical issues (bad payment links)
- Generate weekly summary reports

## 🔗 Related Files

- `scripts/conversation-audit.ts` - Main audit script
- `scripts/db-sync.ts` - Database sync utilities
- `src/lib/agent-database.ts` - Database interface
- `src/agents/dstealth-agent.ts` - Main agent code

## 💡 Troubleshooting

### Common Issues:

**"Redis not available"**: Check UPSTASH environment variables
**"Client not initialized"**: Verify WALLET_KEY and ENCRYPTION_KEY
**"No conversations found"**: Agent may not have processed any messages yet
**"Permission denied"**: Check file permissions on script files

### Debug Mode:
```bash
DEBUG=* yarn audit:conversations  # Verbose logging
``` 