from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        (
            'planning',
            '0016_focusstate',
        ),
    ]

    operations = [
        migrations.AddField(
            model_name='planningitem',
            name='manual_requested_order',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name='planningitem',
            constraint=models.CheckConstraint(
                condition=(
                    Q(
                        manual_requested_order__isnull=True,
                    )
                    | Q(
                        manual_requested_order__gte=1,
                    )
                ),
                name='planning_item_manual_order_positive',
            ),
        ),
        migrations.AddConstraint(
            model_name='planningitem',
            constraint=models.CheckConstraint(
                condition=(
                    Q(
                        manual_requested_order__isnull=True,
                    )
                    | Q(
                        manual_requested_date__isnull=False,
                    )
                ),
                name='planning_item_manual_order_requires_date',
            ),
        ),
    ]
