<p align="center"> <strong> Enterprise-Grade Machine Learning Platform for IFRS 9 Credit Risk Migration Prediction</strong> </p><p align="center"> <em>Predicting Significant Increase in Credit Risk (SICR) with XGBoost & LightGBM Ensemble Architecture</em> </p>

<p align="center"> <img src="https://img.shields.io/badge/version-3.0.0-blue?style=for-the-badge" alt="Version 3.0.0"> <img src="https://img.shields.io/badge/python-3.11+-green?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.11+"> <img src="https://img.shields.io/badge/FastAPI-0.109+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"> <img src="https://img.shields.io/badge/MongoDB-7.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB"> <img src="https://img.shields.io/badge/license-MIT-brightgreen?style=for-the-badge" alt="License MIT"> </p><p align="center"> <img src="https://img.shields.io/badge/IFRS_9-Compliant-00F0FF?style=flat-square" alt="IFRS 9 Compliant"> <img src="https://img.shields.io/badge/XGBoost-Powered-FF6F00?style=flat-square&logo=xgboost&logoColor=white" alt="XGBoost"> <img src="https://img.shields.io/badge/LightGBM-Ensemble-00BFFF?style=flat-square&logo=lightgbm&logoColor=white" alt="LightGBM"> <img src="https://img.shields.io/badge/JWT-Auth-000000?style=flat-square&logo=jsonwebtokens&logoColor=white" alt="JWT Auth"> <img src="https://img.shields.io/badge/WebSocket-Real--time-010101?style=flat-square&logo=socket.io&logoColor=white" alt="WebSocket"> </p>

# Architecture Overview
<p align="center">
  <img width="1000" height="800" alt="IFRS_9_Early_Warning_System" src="IFRS_9_Early_Warning_System.png" />
</p>

# Machine Learning Framework
<p align="center">
  <img width="1000" height="800" alt="IFRS_9_Machine_Learning_Framework" src="IFRS_9_Machine_Learning_Framework.png" />
</p>

# Portfolio Migration Analysis
<p align="center">
  <img width="1000" height="800" alt="Predicting_IFRS_9_Portfolio_Migration" src="Predicting_IFRS_9_Portfolio_Migration.png" />
</p>


```bash
git clone https://github.com
cd repo
npm install
```

# CORE

## Real-Time SICR Prediction

- Single Loan Assessment - Predict Stage 2 migration probability in < 50ms

- Batch Processing - Process entire loan portfolios simultaneously

- Risk Tier Classification - Automatic categorization (Very Low → Very High)

- Actionable Recommendations - Immediate Review / Review / Monitor



# IFRS 9 Compliance Suite

- Stage 1 Detection - Performing loans with 12-month ECL
- Stage 2 Detection - Significant Increase in Credit Risk (SICR) with Lifetime ECL
- Stage 3 Detection - Credit-impaired assets with Lifetime ECL
- PD Doubling Triggers - Automatic regulatory threshold monitoring
- Forbearance Flag Integration - Qualitative trigger assessment



# TECHNICAL ARCHITECTURE

## Advanced ML Architecture

- XGBoost & LightGBM Ensemble - Multi-model gradient boosting

- Feature Engineering Pipeline - Automated preprocessing & transformation

- Model Calibration - Platt Scaling for probability calibration

- Optimal Threshold Tuning - ROC-AUC optimized cutoff points

- Real-Time Inference API - Sub-50ms prediction latency



## Enterprise Security

- JWT Authentication - Access & refresh token rotation

- Two-Factor Authentication (2FA) - TOTP-based verification

- Role-Based Access Control - Admin / Analyst / Viewer roles

- Session Management - MongoDB-backed session tracking

- Audit Logging - Complete prediction audit trail

- Password Encryption - Bcrypt hashing (12 rounds)

- Data Encryption - Fernet symmetric encryption for sensitive data



## Live Monitoring Dashboard

- Real-Time Metrics - Predictions per day, latency, accuracy

- Risk Distribution Charts - Interactive Plotly visualizations

- Feature Drift Detection - Automated data drift monitoring

- Model Performance Tracking - Accuracy, precision, recall, F1-score

- Latency Timeline - Request processing time analytics

- Audit Log Viewer - Searchable prediction history



## Real-Time Communication

- WebSocket Support - Live prediction streaming

- Server-Sent Events - Real-time metric updates

- Push Notifications - High-risk alert broadcasting

- Connection Management - Auto-reconnect with exponential backoff



## Email Integration

- Welcome Emails - Automated onboarding messages

- Password Reset - Secure token-based reset flow

- 2FA Setup - QR code generation for authenticator apps

- Alert Notifications - High-risk prediction alerts

- SMTP Support - Gmail, Outlook, custom SMTP servers


# TECH STACK

## Backend

- FastAPI - High-performance async web framework

- Motor - Async MongoDB driver

- Pydantic - Data validation & serialization

- Passlib - Password hashing

- python-jose - JWT token handling

- PyOTP - Two-factor authentication

- aiosmtplib - Async email sending



## Machine Learning

- XGBoost - Gradient boosting classifier

- LightGBM - Light gradient boosting

- Scikit-learn - Preprocessing & metrics

- Pandas - Data manipulation

- NumPy - Numerical computing

- Joblib - Model serialization



## Database & Caching

- MongoDB - Primary database

- Redis - Session store & cache

- Prometheus - Metrics collection






