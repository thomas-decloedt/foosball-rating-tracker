# GitHub Multi-Account Setup Guide

## Current Configuration

- **Repository**: `thomas-decloedt/foosball-elo-tracker`
- **Remote URL**: `git@github.com:thomas-decloedt/foosball-elo-tracker.git`
- **Git User**: Thomas Decloedt (thomas.r.decloedt@gmail.com)

## Option 1: SSH Config for Multiple Accounts (Recommended)

If you have multiple GitHub accounts, set up SSH config to use different keys:

### 1. Generate SSH Key for This Account (if needed)

```bash
ssh-keygen -t ed25519 -C "thomas.r.decloedt@gmail.com" -f ~/.ssh/id_ed25519_thomas-decloedt
```

### 2. Add SSH Key to GitHub

```bash
# Copy the public key
cat ~/.ssh/id_ed25519_thomas-decloedt.pub
# Then add it to GitHub: https://github.com/settings/keys
```

### 3. Configure SSH Config

Edit `~/.ssh/config`:

```
# Default GitHub account
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes

# thomas-decloedt account
Host github.com-thomas-decloedt
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_thomas-decloedt
  IdentitiesOnly yes
```

### 4. Update Remote URL

```bash
git remote set-url origin git@github.com-thomas-decloedt:thomas-decloedt/foosball-elo-tracker.git
```

## Option 2: Use HTTPS with Credential Helper

If you prefer HTTPS:

```bash
# Update remote to HTTPS
git remote set-url origin https://github.com/thomas-decloedt/foosball-elo-tracker.git

# Use GitHub CLI or credential helper
gh auth login
```

## Option 3: Set Git Config Per Repository

Configure git user for this specific repo:

```bash
# Already set, but you can verify:
git config user.name "Thomas Decloedt"
git config user.email "thomas.r.decloedt@gmail.com"

# To set globally for all repos:
# git config --global user.name "Thomas Decloedt"
# git config --global user.email "thomas.r.decloedt@gmail.com"
```

## Test Connection

```bash
# Test SSH connection
ssh -T git@github.com-thomas-decloedt
# Should say: Hi thomas-decloedt! You've successfully authenticated...
```

## Push to GitHub

Once configured:

```bash
# Stage all changes
git add .

# Commit
git commit -m "Add deployment configuration and features"

# Push to main branch
git push -u origin main
```

## Troubleshooting

### If you get "Permission denied" errors:

1. Check SSH key is added to GitHub account
2. Test SSH connection: `ssh -T git@github.com-thomas-decloedt`
3. Verify SSH config is correct

### If you need to switch accounts:

- Use different SSH hosts in `~/.ssh/config`
- Or use `gh auth switch` if using GitHub CLI
