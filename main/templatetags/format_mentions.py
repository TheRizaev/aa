
from django import template
from django.utils.safestring import mark_safe
import re

register = template.Library()

@register.filter
def split(value, arg):
    """Split a string by the given delimiter"""
    return value.split(arg)

@register.filter
def format_mentions(text):
    """Format @mentions in text with proper styling"""
    if not text:
        return text
    
    # Replace @username with styled span
    mention_pattern = r'@(\w+)'
    formatted_text = re.sub(
        mention_pattern, 
        r'<span class="user-mention">@\1</span>', 
        text
    )
    
    return mark_safe(formatted_text)