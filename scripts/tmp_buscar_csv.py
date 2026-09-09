import csv

targets = {'001784846-2', '001014546-1', '001596514-3', '001068842-3'}

with open('/mnt/c/Desarrollo/SRH/Seguimientos-Alexis/output/seguimientos_concursos_limpio.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['cargo_baja'].strip() in targets:
            print('---')
            print(f"cargo_baja          : {row['cargo_baja']}")
            print(f"sigla               : {row['sigla']}")
            print(f"estado              : {row['estado']}")
            print(f"ee_baja_ampliacion  : {row['ee_baja_ampliacion']}")
            print(f"ee_concurso         : {row['ee_concurso']}")
            print(f"especialidad_sol    : {row['especialidad_solicitada_2']}")
            print(f"fecha_autorizacion  : {row['fecha_autorizacion']}")
            print(f"sorteo_de_jurado    : {row['sorteo_de_jurado']}")
            print(f"disposicion         : {row['disposicion']}")
            print(f"fecha_insc_desde    : {row['fecha_insc_desde']}")
            print(f"fecha_insc_hasta    : {row['fecha_insc_hasta']}")
            print(f"q_inscriptos        : {row['q_inscriptos']}")
            print(f"fecha_examen        : {row['fecha_examen']}")
            print(f"orden_de_merito     : {row['orden_de_merito']}")
            print(f"fecha_om            : {row['fecha_om']}")
            print(f"insal               : {row['insal']}")
            print(f"fecha_ifacs         : {row['fecha_ifacs']}")
            print(f"fecha_insal         : {row['fecha_insal']}")
            print(f"ee_designacion      : {row['ee_designacion']}")
            print(f"resolucion_desig    : {row['resolucion_de_designacion']}")
            print(f"fecha_resolucion    : {row['fecha_resolucion_1']}")
            print(f"cargo_sial          : {row['cargo_sial']}")
            print(f"cambio_especialidad : {row['cambio_especialidad']}")
            print(f"suspendido          : {row['suspendido']}")
            print(f"q_inscriptos        : {row['q_inscriptos']}")
