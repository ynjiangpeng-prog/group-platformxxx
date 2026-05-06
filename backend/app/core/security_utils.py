"""Security utilities for safe object updates."""

# Fields that should never be updated via API mass assignment
PROTECTED_FIELDS = {
    'id', 'company_id', 'created_by', 'updated_by', 
    'is_deleted', 'created_at', 'updated_at', 
    'password_hash', 'is_super_admin'
}

def safe_update(obj, data: dict, extra_protected: set = None) -> None:
    """Safely update an object, excluding protected fields.
    
    Args:
        obj: The object to update
        data: Dictionary of field names and values
        extra_protected: Additional fields to protect beyond defaults
    """
    protected = PROTECTED_FIELDS.copy()
    if extra_protected:
        protected.update(extra_protected)
    
    for key, value in data.items():
        if key not in protected and hasattr(obj, key):
            setattr(obj, key, value)
