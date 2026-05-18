Anonimizacion: añadir un icono de un ojo (abierto o cerrado) para que cuando este cerrado no se vean los totales en euros invertidos, solo metricas en porcentajes

Exportar a CSV/Excel — botón en la tabla de General y en la de Mensuales que descargue los datos mostrados. Implementable 100% en frontend sin backend.

Correccion de Bugs:


En general, la Evolución Real del patrimonio no encaja con los datos sumados de Evolución Real por Fondo ni con los de Resumen de Inversiones. Introduce un test para que la posicion total deba coincidir fecha a fecha.


En Evolución/Calendario de Rentabilidades Anuales, tiene que haber tanto 2026 como 2026 anualizado para comparar con 2025. En el formato Mensual, si se elige el año en curso y se muestran meses del año anterior, tienes que indicar que son del año anterior. Piensa la mejor forma de hacerlo automaticamente para que a 2025 le siga 2026 anualizado, y a este 2026 (y asi las comparaciones sean mas justas). Hablo de 2026 y 2025 pero es el año en curso y el anterior.


Nueva corrección de bugs:

En Carteras, cuando añado un fondo a una cartera (copiando por ejemplo mi cartera real), no se mantienen las cantidades exactas (tal vez se estén redondeando porcentajes).

En Carteras, para los traspasos, se tiene que poder traspasar a un fondo nuevo. Tambien tienes que dar la opcion de traspasar todo (con un boton o algo así). Los traspasos se deben poder hacer al crear la cartera (ahora para hacerlos tengo que guardar y editar)

En Carteras/Comparar los botones de Todos/Ninguno tienen que seleccionar todas las carteras a comparar, ahora sirven para mostrar las lineas una vez se han seleccionado. Tienes que mostrar tambien la tabla de retornos que hay en la pestaña de Evolucion. 

Tarda mucho en hacer la comparativa de carteras, mira si hay alguna forma de darle más velocidad

En Retiradas, revisa que el algoritmo este funcionando bien, si pongo 50000€ sale esto, que no tiene sentido:
Venta Directa (FIFO)
Ganancia
-569,86 €
Impuesto
0,00 €
Neto
50.000,01 €
Traspaso + Reembolso (Optimizado)
Ganancia
373,60 €
Impuesto
70,98 €
Neto
49.929,04 €


En Oportunidades, añade ejemplos detallados con graficas a la explicacion de los indicadores



No encaja la evolucion por fondo agregada con la evolucion total de la cartera. La que esta bien es la primera. 
No esta cuadrando el gráfico de Evolución Real del Patrimonio con los individuales de Evolución por Fondo (los ultimos son los que estan bien). En el primero se ve un aumento subito en el ultimo dia. Revisa esto a fondo y corrigelo (no mistakes).



En Evolución, no termina de funcionar bien el arrastre para cambiar el orden. Cuando se hace en el primero tiene que aplicar al resto de graficos de la pagina. Los gráficos de retornos tienen que tener el mismo filtro



Cuando se hace hover y salen etiquetas tiene que estar en el mismo estilo que el resto del dashboard




En retiradas, no funciona el Reembolso Directo sin Estrategia (FIFO puro).
Añade la opcion de no tocar algun fondo/ETF. ¿Si vendo un fondo o ETF, puedo volver a comprarlo luego? Creo que hay alguna ley al respecto, explicala.
Que significa  "La ganancia patrimonial tributa en el IRPF como renta del ahorro."? Explicalo


Nuevas funcionalidades:


En Oportunidades:
no entiendo las metricas que has hecho. actualiza y utiliza el notebook para hacer un ejemplo. creo que beneficiaria el uso de graficas mostrando esos elementos de tendencia. creo que hacen falta tambien elementos de tendencias a corto plazo (busco aprovechar pequeñas caidas para invertir en fondos mas que grandes correcciones)

General:
Me gustaría hacer una app movil a partir de esto, es posible?