import joblib
import pandas as pd
import numpy as np
import logging
import os
from typing import List, Dict, Any, Optional
from functools import lru_cache
from datetime import datetime, timedelta
import hashlib
import json

logger = logging.getLogger(__name__)

class IFRS9ModelService:
    """Enhanced IFRS 9 Model Service with prediction caching and model versioning"""
    
    def __init__(self, model_path: str = "models/ifrs9_stage2_model.pkl"):
        self.model_path = model_path
        self.model = None
        self.scaler = None
        self.imputer = None
        self.feature_columns = None
        self.optimal_threshold = 0.5
        self.model_version = "3.0.0"
        self.model_metadata = {}
        self.last_trained = None
        self.prediction_cache = {}
        self.cache_ttl = timedelta(minutes=5)
        self.max_cache_size = 10000
        self.total_predictions = 0
        self.load_artifacts()

    def load_artifacts(self):
        """Load model artifacts with comprehensive fallback mechanisms"""
        if not os.path.exists(self.model_path):
            logger.warning(f"Model not found at {self.model_path}")
            logger.info("Checking for alternative model paths...")
            
            # Check alternative paths
            alt_paths = [
                "models/ifrs9_model.pkl",
                "models/ifrs9_stage2_model.joblib",
                "models/credit_risk_model.pkl"
            ]
            
            for alt_path in alt_paths:
                if os.path.exists(alt_path):
                    logger.info(f"Found model at {alt_path}")
                    self.model_path = alt_path
                    break
            else:
                logger.warning("No model found. Running in simulation mode")
                self._initialize_simulation_mode()
                return
            
        try:
            logger.info(f"Loading IFRS9 artifacts from {self.model_path}")
            artifacts = joblib.load(self.model_path)
            
            # Load model components with validation
            self.model = artifacts.get('model')
            if self.model is None:
                raise ValueError("Model not found in artifacts")
            
            self.scaler = artifacts.get('scaler')
            self.imputer = artifacts.get('imputer')
            self.feature_columns = artifacts.get('feature_columns', [])
            
            if not self.feature_columns:
                logger.warning("Feature columns not found in artifacts")
                self.feature_columns = self._get_default_features()
            
            self.optimal_threshold = artifacts.get('optimal_threshold', 0.5)
            self.model_version = artifacts.get('model_version', '3.0.0')
            self.model_metadata = artifacts.get('metadata', {})
            self.last_trained = artifacts.get('training_date', datetime.utcnow())
            
            # Validate model
            self._validate_model()
            
            logger.info(f"Model v{self.model_version} loaded successfully")
            logger.info(f"Model type: {type(self.model).__name__}")
            logger.info(f"Features: {len(self.feature_columns)} columns")
            logger.info(f"Last trained: {self.last_trained}")
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}", exc_info=True)
            self._initialize_simulation_mode()

    def _initialize_simulation_mode(self):
        """Initialize service in simulation mode"""
        logger.info("Initializing simulation mode")
        self.model = None
        self.scaler = None
        self.imputer = None
        self.feature_columns = self._get_default_features()
        self.optimal_threshold = 0.6
        self.model_version = "simulation"
        self.model_metadata = {
            "mode": "simulation",
            "description": "High-fidelity simulation for demonstration"
        }

    def _get_default_features(self) -> List[str]:
        """Get default feature columns for IFRS 9 model"""
        return [
            'loan_amount_gbp', 'outstanding_balance_gbp',
            'original_loan_term_months', 'remaining_term_months',
            'interest_rate_pct', 'vintage_year',
            'internal_credit_score', 'credit_score_change_last_quarter',
            'bureau_inquiries_last_6m', 'days_past_due_current',
            'missed_payments_last_12m', 'months_on_book',
            'pd_12m_at_origination_pct', 'pd_12m_current_pct',
            'pd_relative_change_pct', 'loan_to_value_ratio',
            'debt_to_income_ratio', 'employment_length_years'
        ]

    def _validate_model(self):
        """Validate model with test prediction"""
        try:
            # Create test data
            test_data = {
                'loan_amount_gbp': 250000,
                'outstanding_balance_gbp': 240000,
                'original_loan_term_months': 360,
                'remaining_term_months': 340,
                'interest_rate_pct': 5.2,
                'vintage_year': 2024,
                'internal_credit_score': 680,
                'credit_score_change_last_quarter': -15,
                'bureau_inquiries_last_6m': 2,
                'days_past_due_current': 0,
                'missed_payments_last_12m': 0,
                'months_on_book': 20,
                'pd_12m_at_origination_pct': 1.20,
                'pd_12m_current_pct': 1.85,
                'pd_relative_change_pct': 54.2,
                'loan_to_value_ratio': 80.0,
                'debt_to_income_ratio': 35.0,
                'employment_length_years': 5.0
            }
            
            # Run test prediction
            test_results = self.predict([test_data])
            
            if test_results and len(test_results) > 0:
                logger.info(f"Model validation successful: {test_results[0]['risk_tier']}")
            else:
                logger.warning("Model validation returned no results")
                
        except Exception as e:
            logger.error(f"Model validation failed: {e}")
            raise ValueError(f"Model validation failed: {e}")

    def _get_cache_key(self, input_dict: Dict) -> str:
        """Generate cache key from input features"""
        # Use key features for cache key
        key_features = [
            'internal_credit_score', 
            'pd_relative_change_pct',
            'days_past_due_current', 
            'loan_amount_gbp',
            'credit_score_change_last_quarter',
            'missed_payments_last_12m'
        ]
        
        cache_dict = {k: input_dict.get(k, 0) for k in key_features}
        cache_str = json.dumps(cache_dict, sort_keys=True)
        return hashlib.md5(cache_str.encode()).hexdigest()

    def _check_cache(self, cache_key: str) -> Optional[Dict]:
        """Check prediction cache with TTL"""
        if cache_key in self.prediction_cache:
            cached = self.prediction_cache[cache_key]
            if datetime.utcnow() - cached['timestamp'] < self.cache_ttl:
                return cached['result']
            else:
                del self.prediction_cache[cache_key]
        return None

    def _update_cache(self, cache_key: str, result: Dict):
        """Update prediction cache with size management"""
        self.prediction_cache[cache_key] = {
            'result': result,
            'timestamp': datetime.utcnow()
        }
        
        # Clean old cache entries if too large
        if len(self.prediction_cache) > self.max_cache_size:
            # Remove oldest entries
            sorted_items = sorted(
                self.prediction_cache.items(),
                key=lambda x: x[1]['timestamp']
            )
            items_to_remove = len(self.prediction_cache) - self.max_cache_size + 1000
            for key, _ in sorted_items[:items_to_remove]:
                del self.prediction_cache[key]

    def predict(self, input_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enhanced prediction pipeline with caching and validation"""
        if self.model is None:
            logger.debug("Using simulation mode for predictions")
            return self._simulate_predictions(input_data)
        
        results = []
        batch_start_time = datetime.utcnow()
        
        for i, data in enumerate(input_data):
            try:
                # Check cache first
                cache_key = self._get_cache_key(data)
                cached_result = self._check_cache(cache_key)
                
                if cached_result:
                    cached_result['loan_id'] = data.get('loan_id', f'batch_{i}')
                    cached_result['cached'] = True
                    results.append(cached_result)
                    continue
                
                # Prepare features
                df = pd.DataFrame([data])
                
                # Ensure all required features are present
                for feat in self.feature_columns:
                    if feat not in df.columns:
                        df[feat] = 0.0
                
                # Select and order features
                X = df[self.feature_columns].copy()
                
                # Handle missing values
                if self.imputer:
                    X_imputed = self.imputer.transform(X)
                else:
                    X_imputed = X.fillna(0)
                
                # Scale features
                if self.scaler:
                    X_scaled = self.scaler.transform(X_imputed)
                else:
                    X_scaled = X_imputed.values
                
                # Make prediction
                if hasattr(self.model, 'predict_proba'):
                    prob = float(self.model.predict_proba(X_scaled)[:, 1][0])
                else:
                    prob = float(self.model.predict(X_scaled)[0])
                
                # Ensure probability is in valid range
                prob = max(0.0, min(1.0, prob))
                
                # Format prediction
                prediction = self._format_prediction(
                    data.get('loan_id', f'batch_{i}'), 
                    prob
                )
                
                # Cache the result
                self._update_cache(cache_key, prediction)
                results.append(prediction)
                
            except Exception as e:
                logger.error(f"Prediction failed for record {i}: {e}")
                # Return a safe fallback prediction
                fallback = self._create_fallback_prediction(
                    data.get('loan_id', f'batch_{i}')
                )
                results.append(fallback)
        
        # Update statistics
        self.total_predictions += len(results)
        batch_duration = (datetime.utcnow() - batch_start_time).total_seconds()
        
        logger.debug(
            f"Batch prediction completed: {len(results)} predictions "
            f"in {batch_duration:.2f}s "
            f"({batch_duration/len(results)*1000:.1f}ms avg)"
        )
        
        return results

    def predict_single(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Predict for a single record"""
        results = self.predict([input_data])
        return results[0] if results else self._create_fallback_prediction(
            input_data.get('loan_id', 'unknown')
        )

    def _format_prediction(self, loan_id: str, probability: float) -> Dict[str, Any]:
        """Format prediction result with detailed information"""
        # Determine risk tier
        if probability >= 0.8:
            risk_tier = 'Very High'
            risk_color = '#ef4444'
        elif probability >= 0.6:
            risk_tier = 'High'
            risk_color = '#f97316'
        elif probability >= 0.4:
            risk_tier = 'Medium'
            risk_color = '#fbbf24'
        elif probability >= 0.2:
            risk_tier = 'Low'
            risk_color = '#34d399'
        else:
            risk_tier = 'Very Low'
            risk_color = '#10b981'
        
        # Determine migration status
        predicted_migration = 1 if probability >= self.optimal_threshold else 0
        
        # Determine recommended action
        if probability >= 0.8:
            recommended_action = 'Immediate Review Required'
            action_urgency = 'critical'
        elif probability >= 0.6:
            recommended_action = 'Detailed Review'
            action_urgency = 'high'
        elif probability >= 0.4:
            recommended_action = 'Enhanced Monitoring'
            action_urgency = 'medium'
        elif probability >= 0.2:
            recommended_action = 'Regular Monitoring'
            action_urgency = 'low'
        else:
            recommended_action = 'Standard Monitoring'
            action_urgency = 'minimal'
        
        # Calculate confidence score (simplified)
        confidence_score = 1.0 - abs(probability - 0.5) * 2
        
        return {
            "loan_id": loan_id,
            "migration_probability": round(probability, 4),
            "probability_percentage": round(probability * 100, 2),
            "predicted_migration": predicted_migration,
            "migration_status": "SICR Detected" if predicted_migration else "No SICR",
            "ifrs9_stage": 2 if predicted_migration else 1,
            "risk_tier": risk_tier,
            "risk_color": risk_color,
            "recommended_action": recommended_action,
            "action_urgency": action_urgency,
            "confidence_score": round(confidence_score, 4),
            "model_version": self.model_version,
            "threshold_used": self.optimal_threshold,
            "cached": False
        }

    def _create_fallback_prediction(self, loan_id: str) -> Dict[str, Any]:
        """Create a safe fallback prediction"""
        return {
            "loan_id": loan_id,
            "migration_probability": 0.5,
            "probability_percentage": 50.0,
            "predicted_migration": 0,
            "migration_status": "Uncertain",
            "ifrs9_stage": 1,
            "risk_tier": "Unknown",
            "risk_color": "#6b7280",
            "recommended_action": "Manual Review Required",
            "action_urgency": "unknown",
            "confidence_score": 0.0,
            "model_version": self.model_version,
            "threshold_used": self.optimal_threshold,
            "error": "Prediction failed, using fallback",
            "cached": False
        }

    def _simulate_predictions(self, input_data: List[Dict]) -> List[Dict]:
        """High-fidelity simulation when model not available"""
        results = []
        
        for data in input_data:
            # Determine risk factors
            risk_factors = []
            probability = 0.0
            
            # Check credit score
            credit_score = data.get('internal_credit_score', 700)
            if credit_score < 500:
                probability += 0.3
                risk_factors.append("Very low credit score")
            elif credit_score < 600:
                probability += 0.2
                risk_factors.append("Low credit score")
            elif credit_score < 700:
                probability += 0.1
            
            # Check PD change
            pd_change = data.get('pd_relative_change_pct', 0)
            if pd_change > 100:
                probability += 0.25
                risk_factors.append("PD more than doubled")
            elif pd_change > 50:
                probability += 0.15
                risk_factors.append("Significant PD increase")
            
            # Check days past due
            dpd = data.get('days_past_due_current', 0)
            if dpd > 30:
                probability += 0.3
                risk_factors.append("Severe delinquency (>30 DPD)")
            elif dpd > 15:
                probability += 0.2
                risk_factors.append("Moderate delinquency (>15 DPD)")
            elif dpd > 5:
                probability += 0.1
                risk_factors.append("Early delinquency")
            
            # Check missed payments
            missed = data.get('missed_payments_last_12m', 0)
            if missed >= 3:
                probability += 0.25
                risk_factors.append("Multiple missed payments")
            elif missed >= 1:
                probability += 0.15
                risk_factors.append("Recent missed payment")
            
            # Check credit score change
            score_change = data.get('credit_score_change_last_quarter', 0)
            if score_change < -50:
                probability += 0.2
                risk_factors.append("Significant score deterioration")
            elif score_change < -20:
                probability += 0.1
                risk_factors.append("Score decline")
            
            # Check LTV ratio if available
            ltv = data.get('loan_to_value_ratio', 80)
            if ltv > 95:
                probability += 0.15
                risk_factors.append("High LTV ratio")
            
            # Add some randomness for simulation
            probability += np.random.uniform(-0.05, 0.1)
            
            # Ensure probability is in valid range
            probability = max(0.01, min(0.99, probability))
            
            # Create prediction
            prediction = self._format_prediction(
                data.get('loan_id', f'sim_{len(results)}'), 
                probability
            )
            
            # Add simulation-specific info
            prediction['simulation'] = True
            prediction['risk_factors'] = risk_factors
            prediction['simulation_note'] = (
                "This is a simulated prediction. "
                "For production use, please train and load an actual model."
            )
            
            results.append(prediction)
        
        return results

    def get_model_info(self) -> Dict[str, Any]:
        """Get model information and statistics"""
        return {
            "model_loaded": self.model is not None,
            "model_version": self.model_version,
            "model_type": type(self.model).__name__ if self.model else "Simulation",
            "last_trained": self.last_trained.isoformat() if self.last_trained else None,
            "feature_count": len(self.feature_columns) if self.feature_columns else 0,
            "features": self.feature_columns,
            "optimal_threshold": self.optimal_threshold,
            "total_predictions": self.total_predictions,
            "cache_size": len(self.prediction_cache),
            "cache_ttl_seconds": self.cache_ttl.total_seconds(),
            "metadata": self.model_metadata
        }

    def reload_model(self, model_path: Optional[str] = None):
        """Reload model from disk"""
        if model_path:
            self.model_path = model_path
        
        self.prediction_cache.clear()
        self.load_artifacts()
        logger.info(f"Model reloaded from {self.model_path}")

    def clear_cache(self):
        """Clear prediction cache"""
        cache_size = len(self.prediction_cache)
        self.prediction_cache.clear()
        logger.info(f"Cache cleared ({cache_size} entries removed)")

    def update_threshold(self, new_threshold: float):
        """Update prediction threshold"""
        if 0.0 <= new_threshold <= 1.0:
            self.optimal_threshold = new_threshold
            self.prediction_cache.clear()  # Clear cache as threshold changed
            logger.info(f"Threshold updated to {new_threshold}")
        else:
            raise ValueError("Threshold must be between 0.0 and 1.0")