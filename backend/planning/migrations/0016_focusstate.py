import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            'planning',
            '0015_planningitem_completed_display_date',
        ),
        migrations.swappable_dependency(
            settings.AUTH_USER_MODEL,
        ),
    ]

    operations = [
        migrations.CreateModel(
            name='FocusState',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'current_item',
                    models.ForeignKey(
                        blank=True,
                        db_column='current_item_id',
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='focus_states',
                        to='planning.planningitem',
                    ),
                ),
                (
                    'user',
                    models.OneToOneField(
                        db_column='user_id',
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='focus_state',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'db_table': 'planning_focus_state',
            },
        ),
    ]
