Anonimizacion: añadir un icono de un ojo (abierto o cerrado) para que cuando este cerrado no se vean los totales en euros invertidos, solo metricas en porcentajes

Exportar a CSV/Excel — botón en la tabla de General y en la de Mensuales que descargue los datos mostrados. Implementable 100% en frontend sin backend.

Correccion de Bugs:


En general, la Evolución Real del patrimonio no encaja con los datos sumados de Evolución Real por Fondo ni con los de Resumen de Inversiones. Introduce un test para que la posicion total deba coincidir fecha a fecha.

En Evolución/Crecimiento Porcentual Acumulado, el periodo maximo creo que deberia ser desde la fecha en la que existen los 3 fondos (no pueden empezar 2 y el siguiente empezar a los 4 años). Esta hecho para MAX, pero tiene que ser igual para el resto de periodos (10Y, 5Y, etc). Como se calcula la rentabilidad de Mi Cartera Actual si algunos de los fondos/ETC no están en ese periodo?


En Evolución/Calendario de Rentabilidades Anuales, tiene que haber tanto 2026 como 2026 anualizado para comparar con 2025. En el formato Mensual, si se elige el año en curso y se muestran meses del año anterior, tienes que indicar que son del año anterior. Piensa la mejor forma de hacerlo automaticamente para que a 2025 le siga 2026 anualizado, y a este 2026 (y asi las comparaciones sean mas justas). Hablo de 2026 y 2025 pero es el año en curso y el anterior.

Detalles: Muestra todos los holdings, no solo el top 10. En Mi Cartera tambien, utiliza ponderaciones.

Cuando aparezcan cuadros de dialogo de sistema (por ejemplo al clonar la cartera), el lookandfeel tiene que ser el mismo que en el dashboard (no el por defecto)

Nuevas funcionalidades:
Comparacion de carteras:
Quiero opción a comparar dos carteras, y que este la opcion sencilla de coger mi cartera. Propon opciones partiendo de la pestaña Simulador/Rebalancear Cartera (tal vez se puedan crear carteras a partir de la actual o desde cero en una pestaña, y comparar en otra, dale una vuelta a como introducir persistencia (para añadir tambien fondos que no esten en la cartera a favoritos, etc))

En Oportunidades:
no entiendo las metricas que has hecho. actualiza y utiliza el notebook para hacer un ejemplo. creo que beneficiaria el uso de graficas mostrando esos elementos de tendencia. creo que hacen falta tambien elementos de tendencias a corto plazo (busco aprovechar pequeñas caidas para invertir en fondos mas que grandes correcciones)

General:
Revisa cómo está hecho el frontend. ¿Es la mejor forma para este tipo de aplicaciones? Me gusta el estilo pero está hecho en un solo fichero y no se si eso cumple las best practices. Revisa los estandares de la industria al respecto. Tambien me gustaría hacer una app movil a partir de esto, es posible?