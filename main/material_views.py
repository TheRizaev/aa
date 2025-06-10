from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.contrib import messages
from django.db import transaction
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator
from django.conf import settings
from django.utils import timezone
from .models import Material, MaterialDownload
from .s3_storage import (
    upload_material, get_material_metadata, list_user_materials, 
    generate_material_download_url, delete_material,
    get_all_materials_metadata, update_material_metadata
)
import os
import uuid
import json
import logging

from .notification_views import create_material_notification

logger = logging.getLogger(__name__)

def library_view(request):
    """Главная страница библиотеки"""
    try:
        # Получаем параметры для фильтрации
        material_type = request.GET.get('type')
        search_query = request.GET.get('q', '').strip()
        sort_by = request.GET.get('sort', 'newest')
        
        # Получаем все материалы из S3
        all_materials = get_all_materials_metadata()
        
        # Добавляем информацию о пользователях
        materials_with_authors = []
        for material in all_materials:
            try:
                from .s3_storage import get_user_profile_from_gcs
                user_profile = get_user_profile_from_gcs(material['user_id'])
                
                material['author_display_name'] = user_profile.get('display_name', material['user_id'].replace('@', '')) if user_profile else material['user_id'].replace('@', '')
                material['author_avatar_url'] = user_profile.get('avatar_url') if user_profile else None
                
                # Форматируем дату
                if 'upload_date' in material:
                    try:
                        from datetime import datetime
                        upload_datetime = datetime.fromisoformat(material['upload_date'])
                        material['upload_date_formatted'] = upload_datetime.strftime("%d.%m.%Y")
                    except Exception:
                        material['upload_date_formatted'] = material.get('upload_date', '')[:10]
                
                # Форматируем размер файла
                if 'file_size' in material:
                    size = material['file_size']
                    for unit in ['Б', 'КБ', 'МБ', 'ГБ']:
                        if size < 1024.0:
                            material['formatted_file_size'] = f"{size:.1f} {unit}"
                            break
                        size /= 1024.0
                    else:
                        material['formatted_file_size'] = f"{size:.1f} ТБ"
                
                materials_with_authors.append(material)
            except Exception as e:
                logger.error(f"Error processing material {material.get('material_id')}: {e}")
        
        # Применяем фильтры
        filtered_materials = materials_with_authors
        
        if search_query:
            filtered_materials = [
                m for m in filtered_materials 
                if search_query.lower() in m.get('title', '').lower() or 
                   search_query.lower() in m.get('description', '').lower()
            ]
        
        if material_type:
            filtered_materials = [m for m in filtered_materials if m.get('material_type') == material_type]
        
        # Сортировка
        if sort_by == 'newest':
            filtered_materials.sort(key=lambda x: x.get('upload_date', ''), reverse=True)
        elif sort_by == 'popular':
            filtered_materials.sort(key=lambda x: x.get('download_count', 0), reverse=True)
        elif sort_by == 'name':
            filtered_materials.sort(key=lambda x: x.get('title', '').lower())
        
        # Пагинация
        paginator = Paginator(filtered_materials, 20)
        page_number = request.GET.get('page')
        page_obj = paginator.get_page(page_number)
        
        # Статистика
        total_materials = len(materials_with_authors)
        total_downloads = sum(m.get('download_count', 0) for m in materials_with_authors)
        
        return render(request, 'library/library.html', {
            'materials': page_obj,
            'current_type': material_type,
            'search_query': search_query,
            'sort_by': sort_by,
            'total_materials': total_materials,
            'total_downloads': total_downloads,
            'material_types': Material.MATERIAL_TYPES,
        })
        
    except Exception as e:
        logger.error(f"Error in library view: {e}")
        messages.error(request, 'Ошибка при загрузке библиотеки')
        return render(request, 'library/library.html', {
            'materials': [],
            'material_types': Material.MATERIAL_TYPES,
        })

@login_required
def my_materials_view(request):
    """Мои скачанные материалы"""
    try:
        # Получаем все скачанные пользователем материалы
        downloaded_materials = MaterialDownload.objects.filter(user=request.user).order_by('-downloaded_at')
        
        materials_data = []
        for download in downloaded_materials:
            try:
                # Получаем метаданные из S3
                material_metadata = get_material_metadata(download.material.author.username, str(download.material.id))
                
                if material_metadata:
                    # Добавляем информацию о скачивании
                    material_metadata['downloaded_at'] = download.downloaded_at
                    material_metadata['downloaded_at_formatted'] = download.downloaded_at.strftime("%d.%m.%Y %H:%M")
                    
                    # Получаем информацию об авторе
                    from .s3_storage import get_user_profile_from_gcs
                    user_profile = get_user_profile_from_gcs(download.material.author.username)
                    material_metadata['author_display_name'] = user_profile.get('display_name', download.material.author.username) if user_profile else download.material.author.username
                    material_metadata['author_avatar_url'] = user_profile.get('avatar_url') if user_profile else None
                    
                    # Форматируем размер файла
                    if 'file_size' in material_metadata:
                        size = material_metadata['file_size']
                        for unit in ['Б', 'КБ', 'МБ', 'ГБ']:
                            if size < 1024.0:
                                material_metadata['formatted_file_size'] = f"{size:.1f} {unit}"
                                break
                            size /= 1024.0
                        else:
                            material_metadata['formatted_file_size'] = f"{size:.1f} ТБ"
                    
                    materials_data.append(material_metadata)
            except Exception as e:
                logger.error(f"Error processing downloaded material: {e}")
        
        # Пагинация
        paginator = Paginator(materials_data, 20)
        page_number = request.GET.get('page')
        page_obj = paginator.get_page(page_number)
        
        return render(request, 'library/my_materials.html', {
            'materials': page_obj,
            'total_downloads': len(materials_data)
        })
        
    except Exception as e:
        logger.error(f"Error in my materials view: {e}")
        messages.error(request, 'Ошибка при загрузке ваших материалов')
        return render(request, 'library/my_materials.html', {'materials': []})

@login_required
@require_http_methods(["POST"])
def upload_material_view(request):
    """Загрузка материала в студии - ОБНОВЛЕНО с уведомлениями"""
    try:
        # Получаем файлы и данные из запроса
        material_file = request.FILES.get('material_file')
        title = request.POST.get('title')
        description = request.POST.get('description', '')
        material_type = request.POST.get('material_type')
        
        if not material_file or not title or not material_type:
            return JsonResponse({'error': 'Файл материала, название и тип обязательны'}, status=400)
        
        # Создаем временную директорию
        temp_dir = os.path.join(settings.BASE_DIR, 'temp', 'materials')
        os.makedirs(temp_dir, exist_ok=True)
        
        # Получаем username для S3 storage
        username = request.user.username
        user_id = f"@{username}" if not username.startswith('@') else username
        
        # Временно сохраняем файл материала
        temp_material_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{material_file.name}")
        with open(temp_material_path, 'wb+') as destination:
            for chunk in material_file.chunks():
                destination.write(chunk)
        
        # Загружаем материал в S3
        material_id = upload_material(
            user_id=user_id,
            material_file_path=temp_material_path,
            title=title,
            description=description,
            material_type=material_type
        )
        
        if not material_id:
            if os.path.exists(temp_material_path):
                os.remove(temp_material_path)
            return JsonResponse({'error': 'Не удалось загрузить материал'}, status=500)
        
        # Создаем запись в базе данных
        try:
            material = Material.objects.create(
                id=material_id,
                title=title,
                description=description,
                author=request.user,
                file_path=f"{user_id}/materials/{material_id}{os.path.splitext(material_file.name)[1]}",
                file_name=material_file.name,
                file_size=material_file.size,
                file_type=material_type,
                mime_type=material_file.content_type or 'application/octet-stream'
            )
            
        except Exception as db_error:
            logger.error(f"Error creating database record: {db_error}")
        
        # Удаляем временный файл
        if os.path.exists(temp_material_path):
            os.remove(temp_material_path)
        
        # Создаем уведомления для подписчиков о новом материале
        try:
            create_material_notification(user_id, material_id, title)
            logger.info(f"Created notifications for new material: {material_id}")
        except Exception as notification_error:
            # Не прерываем загрузку материала из-за ошибки уведомлений
            logger.error(f"Failed to create material notifications: {notification_error}")
        
        # Получаем обновленные метаданные
        material_metadata = get_material_metadata(user_id, material_id)
        
        return JsonResponse({
            'success': True,
            'material_id': material_id,
            'metadata': material_metadata
        })
        
    except Exception as e:
        logger.error(f"Error uploading material: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@login_required
@require_http_methods(["GET"])
def list_user_materials_api(request, username=None):
    """API для получения списка материалов пользователя"""
    try:
        # Если username не указан, используем текущего пользователя
        if not username:
            if not request.user.is_authenticated:
                return JsonResponse({'error': 'Пользователь не авторизован'}, status=401)
            username = request.user.username
        
        # Получаем параметры пагинации
        try:
            offset = int(request.GET.get('offset', 0))
        except (ValueError, TypeError):
            offset = 0
            
        try:
            limit = int(request.GET.get('limit', 20))
        except (ValueError, TypeError):
            limit = 20
        
        # Получаем материалы пользователя
        materials = list_user_materials(username)
        
        total_materials = len(materials)
        
        # Применяем пагинацию
        paginated_materials = materials[offset:offset + limit]
        
        # Добавляем дополнительную информацию для каждого материала
        for material in paginated_materials:
            # Форматируем дату загрузки
            upload_date = material.get('upload_date', '')
            if upload_date:
                try:
                    from datetime import datetime
                    upload_datetime = datetime.fromisoformat(upload_date)
                    material['upload_date_formatted'] = upload_datetime.strftime("%d.%m.%Y")
                except Exception:
                    material['upload_date_formatted'] = upload_date[:10] if upload_date else "Недавно"
            else:
                material['upload_date_formatted'] = "Недавно"
            
            # Форматируем размер файла
            if 'file_size' in material:
                size = material['file_size']
                for unit in ['Б', 'КБ', 'МБ', 'ГБ']:
                    if size < 1024.0:
                        material['formatted_file_size'] = f"{size:.1f} {unit}"
                        break
                    size /= 1024.0
                else:
                    material['formatted_file_size'] = f"{size:.1f} ТБ"
        
        return JsonResponse({
            'success': True,
            'materials': paginated_materials,
            'total': total_materials
        })
    
    except Exception as e:
        logger.error(f"Error in list_user_materials_api: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e),
            'materials': []
        }, status=500)

@require_http_methods(["GET"])
def download_material(request, material_id):
    """Скачивание материала"""
    try:
        # Разбираем material_id, который может содержать user_id
        if '__' in material_id:
            user_id, actual_material_id = material_id.split('__', 1)
        else:
            # Если формат старый, пытаемся найти материал
            try:
                material = Material.objects.get(id=material_id)
                user_id = material.author.username
                actual_material_id = material_id
            except Material.DoesNotExist:
                return JsonResponse({'error': 'Материал не найден'}, status=404)
        
        # Получаем метаданные материала
        metadata = get_material_metadata(user_id, actual_material_id)
        if not metadata:
            return JsonResponse({'error': 'Материал не найден'}, status=404)
        
        # Генерируем URL для скачивания
        download_url = generate_material_download_url(user_id, actual_material_id, expiration_time=3600)
        
        if not download_url:
            return JsonResponse({'error': 'Не удалось сгенерировать ссылку для скачивания'}, status=500)
        
        # Если пользователь авторизован, записываем статистику
        if request.user.is_authenticated:
            try:
                material = Material.objects.get(id=actual_material_id)
                
                # Создаем или получаем запись о скачивании
                download_record, created = MaterialDownload.objects.get_or_create(
                    user=request.user,
                    material=material,
                    defaults={
                        'ip_address': get_client_ip(request),
                        'user_agent': request.META.get('HTTP_USER_AGENT', '')[:500]
                    }
                )
                
                # Увеличиваем счетчик скачиваний только если это новое скачивание
                if created:
                    material.download_count += 1
                    material.save()
                    
                    # Обновляем метаданные в S3
                    metadata['download_count'] = material.download_count
                    update_material_metadata(user_id, actual_material_id, metadata)
                
            except Material.DoesNotExist:
                # Материал есть в S3, но нет в БД - создаем запись
                try:
                    from django.contrib.auth.models import User
                    author = User.objects.get(username=user_id.replace('@', ''))
                    
                    material = Material.objects.create(
                        id=actual_material_id,
                        title=metadata.get('title', 'Без названия'),
                        description=metadata.get('description', ''),
                        author=author,
                        file_path=metadata.get('file_path', ''),
                        file_name=metadata.get('file_name', 'unknown'),
                        file_size=metadata.get('file_size', 0),
                        file_type=metadata.get('material_type', 'other'),
                        mime_type=metadata.get('mime_type', 'application/octet-stream'),
                        download_count=metadata.get('download_count', 0) + 1
                    )
                    
                    # Создаем запись о скачивании
                    MaterialDownload.objects.create(
                        user=request.user,
                        material=material,
                        ip_address=get_client_ip(request),
                        user_agent=request.META.get('HTTP_USER_AGENT', '')[:500]
                    )
                    
                    # Обновляем метаданные в S3
                    metadata['download_count'] = material.download_count
                    update_material_metadata(user_id, actual_material_id, metadata)
                    
                except Exception as create_error:
                    logger.error(f"Error creating material record: {create_error}")
            except Exception as e:
                logger.error(f"Error updating download statistics: {e}")
        
        return JsonResponse({
            'success': True,
            'download_url': download_url,
            'filename': metadata.get('file_name', 'material')
        })
        
    except Exception as e:
        logger.error(f"Error in download_material: {e}")
        return JsonResponse({'error': str(e)}, status=500)

@login_required
@require_http_methods(["DELETE"])
def delete_material_view(request, material_id):
    """Удаление материала"""
    try:
        username = request.user.username
        user_id = f"@{username}" if not username.startswith('@') else username
        
        # Удаляем из S3
        success = delete_material(user_id, material_id)
        
        if success:
            # Удаляем из базы данных
            try:
                material = Material.objects.get(id=material_id, author=request.user)
                material.delete()
            except Material.DoesNotExist:
                pass  # Материал есть только в S3
            
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'error': 'Не удалось удалить материал'}, status=400)
            
    except Exception as e:
        logger.error(f"Error deleting material: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

def material_detail_view(request, material_id):
    """Детальная страница материала"""
    try:
        # Разбираем material_id
        if '__' in material_id:
            user_id, actual_material_id = material_id.split('__', 1)
        else:
            try:
                material = Material.objects.get(id=material_id)
                user_id = material.author.username
                actual_material_id = material_id
            except Material.DoesNotExist:
                messages.error(request, 'Материал не найден')
                return redirect('library')
        
        # Получаем метаданные из S3
        metadata = get_material_metadata(user_id, actual_material_id)
        if not metadata:
            messages.error(request, 'Материал не найден')
            return redirect('library')
        
        # Получаем информацию об авторе
        from .s3_storage import get_user_profile_from_gcs
        user_profile = get_user_profile_from_gcs(user_id)
        
        # Проверяем, скачивал ли пользователь этот материал
        has_downloaded = False
        if request.user.is_authenticated:
            try:
                material_obj = Material.objects.get(id=actual_material_id)
                has_downloaded = MaterialDownload.objects.filter(
                    user=request.user,
                    material=material_obj
                ).exists()
            except Material.DoesNotExist:
                pass
        
        # Форматируем данные
        material_data = {
            'id': f"{user_id}__{actual_material_id}",
            'material_id': actual_material_id,
            'user_id': user_id,
            'title': metadata.get('title', 'Без названия'),
            'description': metadata.get('description', ''),
            'author_display_name': user_profile.get('display_name', user_id.replace('@', '')) if user_profile else user_id.replace('@', ''),
            'author_avatar_url': user_profile.get('avatar_url') if user_profile else None,
            'material_type': metadata.get('material_type', 'other'),
            'file_name': metadata.get('file_name', 'unknown'),
            'download_count': metadata.get('download_count', 0),
            'upload_date': metadata.get('upload_date', ''),
            'has_downloaded': has_downloaded
        }
        
        # Форматируем размер файла
        if 'file_size' in metadata:
            size = metadata['file_size']
            for unit in ['Б', 'КБ', 'МБ', 'ГБ']:
                if size < 1024.0:
                    material_data['formatted_file_size'] = f"{size:.1f} {unit}"
                    break
                size /= 1024.0
            else:
                material_data['formatted_file_size'] = f"{size:.1f} ТБ"
        
        # Форматируем дату
        if material_data['upload_date']:
            try:
                from datetime import datetime
                upload_datetime = datetime.fromisoformat(material_data['upload_date'])
                material_data['upload_date_formatted'] = upload_datetime.strftime("%d.%m.%Y")
            except Exception:
                material_data['upload_date_formatted'] = material_data['upload_date'][:10]
        
        return render(request, 'library/material_detail.html', {
            'material': material_data,
            'material_types_dict': dict(Material.MATERIAL_TYPES)
        })
        
    except Exception as e:
        logger.error(f"Error in material detail view: {e}")
        messages.error(request, 'Ошибка при загрузке материала')
        return redirect('library')

def get_client_ip(request):
    """Получает IP-адрес клиента"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip